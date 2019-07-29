const flatMap = require("@climb/flat-map");
const fromEntries = require("@climb/from-entries");

const { data, number, union, string, is, type } = require("@algebraic/type");
const fail = require("@algebraic/type/fail");
const parse = require("@algebraic/ast/parse");
const fromBabel = require("@algebraic/ast/from-babel");
const partition = require("@climb/partition");
const Node = require("@algebraic/ast/node");
const { List, Map, Set } = require("@algebraic/collections");
const { KeyPath, KeyPathsByName } = require("@algebraic/ast/key-path");
const DenseIntSet = require("@algebraic/dense-int-set");
const reachability = require("@climb/dfs-reachability");

const vernacular = name =>
    name.replace(/(?!^)[A-Z](?![A-Z])/g, ch => ` ${ch.toLowerCase()}`);
const forbid = (...names) => fromEntries(names
    .map(name => [name, () => fail.syntax(
        `${vernacular(name)}s are not allowed in concurrent functions.`)]));
const unexpected = node => fail.syntax(
    `${vernacular(node.type)}s are not allowed at this point in concurrent functions.`);

const DependCallee = parse.expression("δ.depend");
const SuccessCallee = parse.expression("δ.success");

const t_success = value =>
    Node.CallExpression({ callee: SuccessCallee, arguments:[value] });
const t_successReturn = ({ argument, ...rest }) =>
    Node.ReturnStatement({ ...rest, argument: t_success(argument) });

const { tApply, tBranch, tBranching,tOperators } = require("./templates");

const mapShortCircuitingExpressions =
    require("./map-short-circuiting-expressions");

// at statement level?
/*module.exports = map(
{
    ...forbid(
        "AssignmentExpression",
        "BreakStatement",
        "ClassDeclaration",
        "ContinueStatement",
        "DoWhileStatement",
        "ForStatement",
        "ForInStatement",
        "ForOfStatement",
        "LabeledStatement",
        "WithStatement",
        "WhileStatement",
        "SwitchStatement"),
});*/

const isIdentifierExpression = (name, node) =>
    is (Node.IdentifierExpression, node) && node.name === name;

const TaskNode = data `TaskNode` (
    name                    => string,
    expression              => Node.Expression,
    ([blockBindingNames])   => [KeyPathsByName,
                                name => KeyPathsByName.just(name)],
    ([freeVariables])       => [KeyPathsByName,
                                expression => expression.freeVariables]);

const ConcurrentNode = union `ConcurrentNode` (
    Node.BlockVariableDeclaration,
    Node.ExpressionStatement,
    Node.ReturnStatement,
    Node.ThrowStatement,
    Node.TryStatement,
    TaskNode );

const DependentNode = data  `DependentNode` (
    id              => number,
    node            => ConcurrentNode,
    dependencies    => DenseIntSet );

const toVariableDeclaration = ({ name, expression: init }) =>
    Node.BlockVariableDeclaration(
    {
        kind: "const",
        declarators: [Node.VariableDeclarator
            ({ id: Node.IdentifierPattern({ name }), init })]
    });

const pipe = (...fs) => value => fs.reduce((value, f) => f(value), value);

module.exports = fromFunction;

function fromFunction(functionNode)
{
    const { body } = functionNode;
    const bodyStatements = is (Node.Expression, body) ?
        [Node.ReturnStatement({ argument: body })] : body.body;

    const normalizedStatements = pipe(
        hoistFunctionDeclarations,
        removeEmptyStatements,
        separateVariableDeclarations,
        fromCascadingIfStatements,
        mapShortCircuitingExpressions)(bodyStatements);

    const [tasks, statements] = normalizedStatements
        .map(toTasksAndStatements)
        .reduce((accum, [tasks, statements]) =>
            [[...accum[0], ...tasks], [...accum[1], ...statements]]);
    const [taskPairs, statementPairs] = toDependencyPairs(tasks, statements);
    const dependencyChain = toDependencyChain(taskPairs, statementPairs);
    const updatedBody =
        Node.BlockStatement({ ...body, ...toFunctionBody(dependencyChain) });

    const NodeType = type.of(functionNode);

    return NodeType({ ...functionNode, body: updatedBody });
}

function toFunctionBody(taskChain)
{
    const statements = taskChain.statements
        .map(statement =>
            is (Node.ReturnStatement, statement) ?
                t_successReturn(statement) : statement);

    if (is (DependencyChain.End, taskChain))
        return Node.BlockStatement({ body: statements });

    const { tasks } = taskChain;
    const thenFunction = Node.FunctionExpression(
    {
        id: null,
        params: tasks.map(Node.IdentifierPattern),
        body: toFunctionBody(taskChain.next)
    });
    const dependStatement = Node.CallExpression(
    {
        callee: DependCallee,
        arguments: [thenFunction, ...tasks.map(task => task.expression)]
    });
    const returnStatement = Node.ReturnStatement({ argument: dependStatement });
    const body = [...statements, returnStatement];

    return Node.BlockStatement({ body });
}

const DependentData = data `DependentData` (
    id              => number,
    dependencies    => Array );

function toDependencyPairs(tasks, statements)
{
    // We "sort" by just putting concurrent sources first. This is because we
    // want them to have contiguous IDs (indexes) so that they can fit in as few
    // slots of a DenseIntSet as possible once we remove all the non-source
    // elements. Otherwise, we could have a bunch of empty slots for no reason.
    const sorted = [...tasks, ...statements];

    // Create a mapping from each element to it's associated sorted index.
    const indexes = Map(ConcurrentNode, number)
        (sorted.map((node, index) => [node, index]));

    // We create a mapping from the binding names exposed by an element to that
    // element. So, a statement like:
    //
    // "const {a,b} = x;"
    //
    // will generate two entries:
    //
    // ["a", "const {a,b} = x;"] and ["b", "const {a,b} = x;"].
    //
    // We can have many binding names pointing to the same element, but we
    // assume the opposite isn't possible since it is a syntax error to redclare
    // a const, and we treat function declarations as consts in concurrent
    // contexts.
    const declarations = Map(string, ConcurrentNode)(
        flatMap(([node, names]) =>
            names.map(name => [name, node]).toArray(),
            sorted.map(node => [node, node.blockBindingNames.keySeq()])));

    // We create a "map" (since the keys are contiguous indexes we just use an
    // array) of all the direct dependencies. This is otherwise known as an
    // adjacency list: a list of all the nodes this node is connected to.
    // 
    // We compute this for each statement by finding the originating declaration
    // for each free variable in the statement. If the free variable has no free
    // originating declaration, then it is a "true free variable" in the sense
    // that that it is defined outside this block, and so we just ignore it
    // since we can essentially treat it as a constant as it won't affect any of
    // our other calculations at all.
    const directDependencies = sorted
        .map(statement => statement
            .freeVariables.keySeq()
            .map(name => declarations.get(name))
            .filter(declaration => !!declaration)
            .map(declaration => indexes.get(declaration)))
        .map(DenseIntSet.from);

    // Now we can calculate *all* the dependencies (including the indirect
    // dependencies) by doing a Depth-First Reachability Search.
    const allDependencies = reachability(directDependencies);

    // This list actually has more information than we are interested in
    // however. We only really care about the reachability to concurrent
    // statements. Otherwise mutually valid recursive declarations would break
    // as they would endlessly wait for eachother. So we'll go ahead and remove
    // all the non-concurrent indexes from our reachability (dependencies)
    // lists.
    const statementsSet = DenseIntSet
        .from(Array.from(statements, (_, index) => index + tasks.length));

    // Additionally, this list also always lists a statement as reachable from
    // itself. Instead of having to remember this later, we'll also go ahead and
    // remove it now.
    const concurrentDependencies = allDependencies
        .map((set, index) => DenseIntSet.subtract(
            DenseIntSet.subtract(set, statementsSet),
            DenseIntSet.just(index)));

    const toDependentPair = node => (id =>
        [node, DependentData({ id, dependencies: concurrentDependencies[id] })])
        (indexes.get(node));

    return [tasks.map(toDependentPair), statements.map(toDependentPair)];
}

const DependencyChain = union `DependencyChain` (
    data `End` (
        statements  => Array ),
    data `Parent` (
        tasks       => [Array, []],
        statements  => [Array, []],
        next        => DependencyChain ) );

function toDependencyChain(taskPairs, statementPairs, available)
{
    if (!available)
        return DependencyChain.Parent({ next:
            toDependencyChain(taskPairs, statementPairs, DenseIntSet.Empty) });

    if (taskPairs.length === 0)
        return DependencyChain.End({ statements:
            statementPairs.map(([node]) => node) });

    const isBlocked = pair => DenseIntSet
        .isEmpty(DenseIntSet.subtract(pair[1].dependencies, available));

    const [unblockedTaskPairs, blockedTaskPairs] =
        partition(isBlocked, taskPairs);
    const [unblockedStatementPairs, blockedStatementPairs] =
        partition(isBlocked, statementPairs);

    const tasks = unblockedTaskPairs.map(pair => pair[0]);
    const statements = unblockedStatementPairs.map(pair => pair[0]);

    const updatedAvailable = DenseIntSet.union(
        available,
        DenseIntSet.union(
            DenseIntSet.from(unblockedTaskPairs.map(pair => pair[1].id)),
            DenseIntSet.from(unblockedTaskPairs.map(pair => pair[1].id))));

    const next = toDependencyChain(
        blockedTaskPairs, blockedStatementPairs, updatedAvailable);

    return DependencyChain.Parent({ tasks, statements, next });
}

var global_num = 0;
function toTasksAndStatements(statement)
{
    const branchKeyPaths =
        statement.freeVariables.get("branch", List(KeyPath)());
    const branchingKeyPaths =
        statement.freeVariables.get("branching", List(KeyPath)());

    if (branchKeyPaths.size <= 0 && branchingKeyPaths.size <= 0)
        return [[], [statement]];


    const firstBranchKeyPath = branchKeyPaths.reduce((longest, keyPath) =>
        longest.length > keyPath.length ? longest : keyPath, KeyPath.Root);
    const firstBranchingKeyPath = branchingKeyPaths.reduce((longest, keyPath) =>
        longest.length > keyPath.length ? longest : keyPath, KeyPath.Root);

    // This is the worst way to do this...
    const branchIsLonger =
        firstBranchKeyPath.length > firstBranchingKeyPath.length;
    const keyPath = branchIsLonger ? firstBranchKeyPath : firstBranchingKeyPath;
    const [insertionPoint, newChild, ancestor] = branchIsLonger ?
        fromBranch(keyPath, statement) :
        fromBranching(keyPath, statement);

    if (is (Node.BlockVariableDeclaration, statement))
    {
        const [declarator] = statement.declarators;
        const { id, init } = declarator;

        if (init === ancestor && is (Node.IdentifierPattern, id))
            return [[TaskNode({ name: id.name, expression: newChild })], []];
    }

    const name = "MADE_UP_" + (global_num++);
    const task = TaskNode({ name, expression: newChild });
    const variable = Node.IdentifierExpression({ name });
    const replaced = KeyPath.setJust(insertionPoint, keyPath, variable, statement);
    const [tasks, statements] = toTasksAndStatements(replaced);

    return [[task, ...tasks], statements];
}

function toArrayExpression(...elements)
{
    return Node.ArrayExpression({ elements });
}

function fromBranch(keyPath, statement)
{
    const [ancestor, remainingKeyPath] = KeyPath.getJust(-1, keyPath, statement);

    const trueCall = ancestor.arguments[0];
    const trueCallee = trueCall.callee;
    const receiver = !is (Node.MemberExpression, trueCallee) ?
        trueCallee :
        toArrayExpression(
            trueCallee.object,
            is (Node.ComputedMemberExpression, trueCallee) ?
                trueCallee.property :
                Node.StringLiteral({ value: trueCallee.property.name }));
//console.log(require("@babel/generator").default(ancestor).code);
//console.log(trueCall.arguments);
    const invocation =
        toArrayExpression(receiver, toArrayExpression(...trueCall.arguments));

    return [-1, invocation, ancestor];
}

function fromBranching(keyPath, statement)
{
    const [ancestor, remainingKeyPath] =
        KeyPath.getJust(-3, keyPath, statement);

    const isBranching = argument =>
        is (Node.CallExpression, argument) &&
        isIdentifierExpression("branching", argument.callee);
    const ds = flatMap(
        (argument, index) => isBranching(argument) ? [index] : [],
        ancestor.arguments);
    const args = ancestor
        .arguments
        .map(argument => isBranching(argument) ? argument.arguments[0] : argument);

    const autoBranch = tBranch(tApply(ancestor.callee, ds, args));
    const autoBranchKeyPath = autoBranch.freeVariables.get("branch").get(0);
    const [, autoDeBranched] = fromBranch(autoBranchKeyPath, autoBranch);

    return [-3, autoDeBranched, ancestor];
}

function fromCascadingIfStatements(statements)
{
    // We want to be in single result form:
    // [declaration-1, declaration-2, ..., declaration-N, result]
    //
    // However, we *allow* intermediate if-gaurded early results, but we
    // do so by transforming it into a single return by wrapping everything
    // after the if-gaurd in an if-function, and return the result of it.
    //
    // Code of the form:
    // [d1, d2, ..., dn, if (test) [s], s1, s2, ..., sN, result]
    //
    // Where:
    // 1. d1, d2, ..., dn are consecutive declarations
    // 2. if (test) [s] is an if statement that ends in a result.
    // 3. s1, s2, ..., sN are either declaration or more if-gaurded early
    //    returns.
    //
    // Becomes:
    // [d1, d2, ..., fIf (test, () => [s], () => [s1, s2, ..., sN, result])]

    // Start by finding the first if-gaurded early return.
    const firstIf = statements.findIndex(is(Node.IfStatement));

    // If we have no if statements, it's pretty easy, just handle the
    // declarations and final result.
    if (firstIf === -1)
        return statements;

    // If not, then construct the if-function to replace the tail of the
    // statements with:
    const { test, consequent } = statements[firstIf];
    // The consequent is now the body of an arrow function, so it has to be
    // an expression or block statement. We expect to only have declarations
    // and return statements, so the special case of a single return
    // statement can folded into just it's argument.
    const consequentBlock = is (Node.BlockStatement, consequent) ?
        consequent : Node.BlockStatement({ body: [consequent] });
    const consequentFunction =
        fromFunction(Node.FunctionExpression({ body: consequentBlock }));

    const alternateBlock =
        Node.BlockStatement({ body: statements.slice(firstIf + 1) });
    const alternateFunction =
        fromFunction(Node.FunctionExpression({ body: alternateBlock }));

    const argument = Node.CallExpression(
    {
        // Should branch?...
        callee: tOperators["?:"],
        arguments: [test,
            tBranching(consequentFunction),
            tBranching(alternateFunction)]
    });

    const returnIf = Node.ReturnStatement({ argument });

    // console.log(require("@babel/generator").default(returnIf).code);
    // Construct the revised statement list:
    return [...statements.slice(0, firstIf), returnIf];
}

function removeEmptyStatements(statements)
{
    const updated = statements.filter(node => !is(Node.EmptyStatement, node));

    return  updated.length !== statements.length ?
            updated :
            statements;
}

function separateVariableDeclarations(statements)
{
    const separate = statement =>
        !is (Node.BlockVariableDeclaration, statement) ||
        statement.declarators.length <= 1 ?
            statement :
            statement.declarators
                .map(declarator =>
                    Node.BlockVariableDeclaration
                        ({ ...statement, declarators: [declarator] }));
    const updated = flatMap(separate, statements);

    return  updated.length !== statements.length ?
            updated :
            statements;
}

function hoistFunctionDeclarations(statements)
{
    // The first step is to hoist all the function declarations to the top.
    // Change them to const declarations to make our lives easier later.
    const [functionDeclarations, rest] =
        partition(is(Node.FunctionDeclaration), statements);

    if (functionDeclarations.length === 0)
        return statements;

    const asVariableDeclarations = functionDeclarations
        .map(functionDeclaration =>
            [functionDeclaration.id,
                Node.FunctionExpression(functionDeclaration)])
        .map(([id, init]) => [Node.VariableDeclarator({ id, init })])
        .map(declarators =>
            Node.BlockVariableDeclaration({ kind: "const", declarators }));

    return [...asVariableDeclarations, ...rest];
}
