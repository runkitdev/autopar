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
const valueToExpression = require("@algebraic/ast/value-to-expression");

const vernacular = name =>
    name.replace(/(?!^)[A-Z](?![A-Z])/g, ch => ` ${ch.toLowerCase()}`);
const forbid = (...names) => fromEntries(names
    .map(name => [name, () => fail.syntax(
        `${vernacular(name)}s are not allowed in concurrent functions.`)]));
const unexpected = node => fail.syntax(
    `${vernacular(node.type)}s are not allowed at this point in concurrent functions.`);

const { tApply, tBranch, tBranching, tOperators, tConst, tNodes, tStartFunction} = require("./templates");
const tBlock = body => Node.BlockStatement({ body });

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

const BranchExpression      = data `BranchExpression` (
    name                    =>  string,
    expression              =>  Node.Expression,
    ([blockBindingNames])   => [KeyPathsByName,
                                name => KeyPathsByName.just(name)],
    ([freeVariables])       => [KeyPathsByName,
                                expression => expression.freeVariables] );

const ConcurrentNode = union `ConcurrentNode` (
    Node.BlockVariableDeclaration,
    Node.ExpressionStatement,
    Node.ReturnStatement,
    Node.ThrowStatement,
    Node.TryStatement,
    BranchExpression );


const toVariableDeclaration = (name, init) =>
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
    const normalizedStatements = pipe(
        hoistFunctionDeclarations,
        removeEmptyStatements,
        separateVariableDeclarations,
        fromCascadingIfStatements,
        mapShortCircuitingExpressions)(getBodyAsStatments(functionNode));

    const taskNodes = normalizedStatements.flatMap(toTaskNodes);
    const dependentData = toDependentData(taskNodes);
    const ready = valueToExpression(
        DenseIntSet.from(dependentData
            .map((data, index) => [data, index])
            .filter(([data, index]) =>
                DenseIntSet.isEmpty(data.dependencies.nodes))
            .map(([_, index]) => index)));
    const start = tStartFunction(functionNode, ready);
    const body = Node.BlockStatement({ body:
    [
        tNodes(dependentData.map(toSerializedTaskNode)),
        Node.ReturnStatement({ argument: start })
    ]});
    const callee = Node.ArrowFunctionExpression({ body });

    return Node.CallExpression({ callee, arguments:[] });
}

function getBodyAsStatments({ body })
{
    return is (Node.Expression, body) ?
        [Node.ReturnStatement({ argument: body })] :
        body.body;
}

function toSerializedTaskNode({ dependencies, dependents, node })
{
    const isBranchExpression = is (BranchExpression, node);
    const isReturnStatement = is (Node.ReturnStatement, node);
    const body = isBranchExpression ?
        node.expression :
        isReturnStatement ?
            node.argument :
            Node.BlockStatement({ body: [
                node,
                Node.ReturnStatement({ argument:
                    Node.ObjectExpression({ properties: node
                        .blockBindingNames
                        .keySeq().toArray()
                        .map(name => Node.IdentifierExpression({ name }))
                        .map(value => Node.ObjectPropertyShorthand({ value }))
                    }) })] });

    const properties = dependencies
        .bindingNames
        .map(name => Node.IdentifierPattern({ name }))
        .map(value => Node.ObjectPropertyPatternShorthand({ value }));
    const params = properties.length > 0 ?
        [Node.ObjectPattern({ properties })] :
        [];

    const action = Node.ArrowFunctionExpression({ body, params });
    const kind = isBranchExpression ? node.name : isReturnStatement ? 1 : 0;

    return valueToExpression([dependencies.nodes, dependents, action, kind]);
}

const DependencyData = data `DependencyData` (
    bindingNames    =>  Array,
    nodes           =>  Array );

const DependentData = data `DependentData` (
    node            => ConcurrentNode,
    dependencies    => DependencyData,
    dependents      => Array );

function toDependentData(nodes)
{
    // Create a mapping from each element to it's associated sorted index.
    const indexes = Map(ConcurrentNode, number)
        (nodes.map((node, index) => [node, index]));

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
            nodes.map(node => [node, node.blockBindingNames.keySeq()])));

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
    const dependencies = nodes
        .map(statement => statement
            .freeVariables.keySeq()
            .map(name => [name, declarations.get(name)])
            .filter(pair => !!pair[1])
            .map(pair => [pair[0], indexes.get(pair[1])])
            .toArray())
        .map(pairs => [
            pairs.map(pair => pair[0]),
            DenseIntSet.from(pairs.map(pair => pair[1]))])
        .map(([bindingNames, nodes]) =>
            DependencyData({ bindingNames, nodes }));
            
    const dependents = dependencies
        .map((data, index) => [
            DenseIntSet.toArray(data.nodes),
            DenseIntSet.just(index)])
        .reduce((dependents, [dependencies, dependent]) =>
            dependencies.reduce((dependents, dependency) =>
                dependents.update(
                    dependency,
                    DenseIntSet.Empty,
                    current => DenseIntSet.union(dependent, current)),
                dependents),
            Map(number, DenseIntSet)());

    return nodes.map((node, index) => DependentData(
    {
        node,
        dependencies: dependencies[index],
        dependents: dependents.get(index, DenseIntSet.Empty)
    }));
}

var global_num = 0;
function toTaskNodes(statement)
{
    const branchKeyPaths =
        statement.freeVariables.get("branch", List(KeyPath)());
    const branchingKeyPaths =
        statement.freeVariables.get("branching", List(KeyPath)());

    if (branchKeyPaths.size <= 0 && branchingKeyPaths.size <= 0)
        return [statement];

    // Branch must come first!
    // This is the worst way to do this...
    const firstBranchKeyPath = branchKeyPaths.reduce((longest, keyPath) =>
        longest.length > keyPath.length ? longest : keyPath, KeyPath.Root);
    const firstBranchingKeyPath = branchingKeyPaths.reduce((longest, keyPath) =>
        longest.length > keyPath.length ? longest : keyPath, KeyPath.Root);

    // -2 comes from the fact that x(branching y) actually represents a branch of
    // the x call.
    const branchIsLonger =
        firstBranchKeyPath.length > firstBranchingKeyPath.length - 2;
    const keyPath = branchIsLonger ? firstBranchKeyPath : firstBranchingKeyPath;
    const [insertionPoint, newChild, ancestor] = branchIsLonger ?
        fromBranch(keyPath, statement) :
        fromBranching(keyPath, statement);

    if (is (Node.BlockVariableDeclaration, statement))
    {
        const [declarator] = statement.declarators;
        const { id, init } = declarator;

        if (init === ancestor && is (Node.IdentifierPattern, id))
            return [BranchExpression({ name: id.name, expression: newChild })];
    }

    const name = "MADE_UP_" + (global_num++);
    const task = BranchExpression({ name, expression: newChild });
    const variable = Node.IdentifierExpression({ name });
    const replaced = KeyPath.setJust(insertionPoint, keyPath, variable, statement);

    return [task, ...toTaskNodes(replaced)];
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
