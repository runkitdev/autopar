const until = require("@climb/until");
const { Δ, data, any, string, or, boolean, object, is, number, array, type } = require("@algebraic/type");
const maybe = require("@algebraic/type/maybe");
const Optional = require("@algebraic/type/optional");
const { List, OrderedMap, Map, Set } = require("@algebraic/collections");
const union = require("@algebraic/type/union-new");
const { KeyPathsByName } = require("@algebraic/ast/key-path");
const getContentAddressOf = require("@algebraic/type/content-address-of");
const DenseIntSet = require("@algebraic/dense-int-set");

const BindingName       =   string;
const ContentAddress    =   string;

const Statement = require("./statement");
const zeroed = T => [T, T()];
const DIS = DenseIntSet;


const Task              =   union `Task` (
    is                  =>  Task.Waiting,
    or                  =>  Task.Active,
    or                  =>  Task.Completed );

Task.Task               =   Task;
Task.Identifier         =   Optional(string);

const Invocation        =   data `Invocation` (
    thisArg             =>  any,
    callee              =>  Function,
    arguments           =>  List(any)/*,
    contentAddress      =>  [string, ""]*/ );
Task.Invocation = Invocation;

Task.Success            =   data `Task.Success` (
    value               =>  any );

Task.Failure            =   data `Task.Failure` (
    name                =>  [Task.Identifier, "hi"],
    errors              =>  List(any) );
    
Task.Running            =   data `Task.Running` (
    EID                 =>  number );

Task.Definition             =   data `Task.Definition` (
    statements              =>  array(Statement),
    ([complete])            =>  [Array, statements =>
                                    DenseIntSet.inclusive(statements.length)],
    entrypoints             =>  Array );

Task.Scope                  =   data `Task.Scope` (
    thisArg                 =>  any,
    bindings                =>  object );

Task.Called                 =   data `Task.Called` (
    definition              =>  Task.Definition,
    scope                   =>  Task.Scope );

// Queued -> CA -> List[References]
// Running -> CA -> List[References]

const Dependents            =   data `Dependents` (
    addresses               =>  Array /*DenseIntSet*/,
    bindings                =>  Set(string) );

Dependents.union = function (lhs, rhs)
{
    if (lhs === false)
        return rhs;

    const addresses = DenseIntSet.union(lhs.addresses, rhs.addresses);
    const bindings = lhs.bindings.concat(rhs.bindings);

    return Dependents({ addresses, bindings });
}

/*const QueueKey              = or (ContentAddress, number);
const QueueItem             = data `QueueItem` (
    invoaction              =>  Invocation,
    statements              =>  zeroed(List(Statement)) );

const BranchQueue           =   data `BranchQueue` (
    nextUnmemoizedID        =>  [number, 0],
    queue                   =>  [OrderedMap(BranchQueue.Key, ) );*/

Task.Continuation           =   data `Task.Continuation` (

    UUID                    =>  or (boolean, string), // EID?
    definition              =>  Task.Definition,
    memoized                =>  [boolean, true],

    scope                   =>  Task.Scope,
    completed               =>  [Array /*DenseIntSet*/, DenseIntSet.Empty],

    children                =>  zeroed(List(Array)),
    references              =>  zeroed(Map(number, List(Statement))),
/*
    ([descendantReferences])    =>  [Set(any), (references, memoizedChildren) =>
                                        unmemoizedChildren
                                            .reduce((references, child) =>
                                                references
                                                    .union(child.descendentReferences),
                                            references)],
*/
//    queued                  =>  [InvocationMap, InvocationMap()],
//    references              =>  [Set(ContentAddress), Set(ContentAddress)()],
    
    // Do we gain anything from this being a map?
    
//    nextQueueID             =>  [number, 0],
//    queued                  =>  zeroed(OrderedMap(QueueKey, List(QueueItem))),



    dependents              =>  [DependentMap, DependentMap()],
    ([running])             =>  [boolean, (children, references) =>
                                    children.size + references.size > 0],

    errors                  =>  [List(any), List(any)()],
    result                  =>  [any, void(0)] );


const ContinuationMap = Map(ContentAddress, Task.Continuation);
const DependentMap = Map(ContentAddress, Dependents);
const InvocationMap = OrderedMap(ContentAddress, Task.Invocation);


Scope = Task.Scope;

Scope.extend = function (scope, newBindings)
{
    const bindings =
        Object.assign(Object.create(scope.bindings), newBindings);

    return Scope({ ...scope, bindings });
}

Task.Failure.from = function (error)
{
    return Task.Failure({ errors: List(any)([error]) });
}

Task.Continuation.start = function (isolate, { definition, scope }, UUID)
{
    const { entrypoints } = definition;
    const continuation =
        Task.Continuation({ UUID, definition, scope });

    return Task.Continuation.update(isolate, continuation, entrypoints);
}

Task.Continuation.update = function update(isolate, continuation, unblocked)
{
    const [uIsolate, uContinuation] = until(
        ([,continuation, unblocked]) =>
            continuation.errors.size > 0 ||
            DenseIntSet.isEmpty(unblocked),
        ([isolate, continuation, unblocked]) =>
        {
            const [address, restUnblocked] = DenseIntSet.first(unblocked);
            const { statements } = continuation.definition;
            const statement = statements[address];
            const [uIsolate, uContinuation, dependents] =
                perform(isolate, continuation, statement);
            const uUnblocked = DenseIntSet.union(restUnblocked, dependents);

            return [uIsolate, uContinuation, uUnblocked];
        }, [isolate, continuation, unblocked]);

    const { definition, UUID } = uContinuation;
    const result =
        uContinuation.errors.size > 0 && !uContinuation.running ?
            Task.Failure({ errors: uContinuation.errors }) :
        DenseIntSet.equals(definition.complete, uContinuation.completed) ?
            Task.Success({ value: uContinuation.result }) :
        uContinuation;

    if (result === uContinuation || UUID === false)
        return [uIsolate, result];

    const uMemoizations = isolate.memoizations.set(UUID, result);

    return [Δ(isolate, { memoizations: uMemoizations }), result];
}

function perform(isolate, continuation, statement)
{
    if (statement.operation === Statement.Operation.Step)
        return [isolate, ...updateScope(continuation,
            statement,
            evaluate(continuation, statement.block))];

    if (statement.operation === Statement.Operation.Return)
    {
        const result = evaluate(continuation, statement.block);
        const uCompleted =
            DenseIntSet.add(statement.address, continuation.completed);
        const uContinuation = Δ(continuation, { completed:uCompleted, result });

        return [isolate, uContinuation, DenseIntSet.Empty];
    }

    return branch(isolate, continuation, statement);
}

function branch(isolate, continuation, statement)
{
    const name = statement.operation.binding;
    const sInvocation = evaluate(continuation, statement.block);
    const invocation = Invocation.deserialize(sInvocation);

    const contentAddress = getContentAddressOf(invocation);
    const memoizable = !!contentAddress;

    // If there already exists a memoized instance of this, just return that.
    if (memoizable && isolate.memoizations.has(contentAddress))
    {
        const memoized = isolate.memoizations.get(contentAddress);

        return is (Task.Running, memoized) ?
            [isolate, reference(continuation, statement, memoized.EID),
                DenseIntSet.Empty] :
            completed(isolate, continuation, statement, memoized);
    }

    // Check if the isolate could support another task.
    if (!isolate.hasVacancy)
    {
        const key = memoizable && contentAddress;
        const uQueued =
            BranchQueue.push(continuation.queued, invocation, statement, key);
        const uContinuation = Δ(continuation, { queued: uQueued });

        return [isolate, uContinuation, DenseIntSet.Empty];
    }

    // This means we can invoke.
    const [isThenable, result] = invoke(invocation);

    if (isThenable)
    {
        const [EID, uIsolate] =
            type.of(isolate).allot(isolate, result, contentAddress);
        const uContinuation = reference(continuation, statement, EID);

        return [uIsolate, uContinuation, DenseIntSet.Empty];
    }

    if (!is (Task.Called, result))
        return completed(isolate, continuation, statement, result);

    // MARK SELF AS RUNNING BEFORE-HAND!
    const [uIsolate, child] =
        Task.Continuation.start(isolate, result, contentAddress);

    if (!is (Task.Continuation, child))
        return completed(uIsolate, continuation, statement, child);

    if (contentAddress === false)
    {
        const uUnmemoizedChildren =
            continuation.unmemoizedChildren.push(child);
        const uContinuation = Δ(continuation,
            { unmemoizedChildren: uUnmemoizedChildren });

        return [uIsolate, uContinuation, DenseIntSet.Empty];
    }

    // Mark running in isolate!
    const uMemoizedChildren =
        continuation.memoizedChildren.set(contentAddress, child);
    const uContinuation =
        Δ(continuation, { memoizedChildren: uMemoizedChildren });

    return [uIsolate, uContinuation, DenseIntSet.Empty];
}

function reference(continuation, statement, EID)
{
    const uReferences = continuation.references
        .update(EID, List(Statement)(),
            statements => statements.push(statement));

    return Δ(continuation, { references: uReferences });
}

function completed(isolate, continuation, statement, result)
{
    if (is (Task.Failure, result))
    {
        const uErrors = continuation.errors.concat(result.errors);
        const uContinuation = Δ(continuation, { errors: uErrors });

        return [isolate, uContinuation, DenseIntSet.Empty];
    }

    const Δbindings = { [statement.operation.binding]: result.value };

    return [isolate, ...updateScope(continuation, statement, Δbindings)];
}

function updateScope(continuation, statement, Δbindings)
{
    const { statements } = continuation.definition;
    const { scope, completed } = continuation;
    const uScope = Scope.extend(scope, Δbindings);
    const uCompleted = DenseIntSet.add(statement.address, completed);
    const uContinuation = Task
        .Continuation({ ...continuation, scope:uScope, completed:uCompleted });
    const unblocked = DenseIntSet.reduce(
        (unblocked, address) =>
            DenseIntSet.isSubsetOf(uCompleted,
                statements[address].dependencies) ?
            DenseIntSet.add(address, unblocked) :
            unblocked,
        DenseIntSet.Empty,
        statement.dependents);

    return [uContinuation, unblocked];
}

Invocation.deserialize = function ([signature, args])
{
    const isMemberCall = Array.isArray(signature);
    const thisArg = isMemberCall ? signature[0] : void(0);
    const callee = isMemberCall ? thisArg[signature[1]] : signature;

    return Invocation({ callee, thisArg, arguments: List(any)(args) });
}

function evaluate(continuation, block)
{
    const { thisArg, bindings } = continuation.scope;

    return block.call(thisArg, bindings);
}

// f() -> .Called() -> run
// f() -> Promise -> consolidate
// f() -> value -> store?

// finished -> (with error)
// finished -> (with success)
// finished -> 

function invoke(invocation)
{
    try
    {
        const { callee, thisArg } = invocation;
        const args = invocation.arguments.toArray();
        const value = callee.apply(thisArg, args);

        if (isThenable(value))
            return [true, value];

        if (is (Task.Called, value))
            return [false, value];

        return [false, Task.Success({ value })];
    }
    catch (error)
    {
        return [false, Task.Failure({ errors:List(any)([error]) })];
    }
}

function isThenable(value)
{
    return !!value && typeof value.then === "function";
}

module.exports = Task;



Task.Continuation.settle = function (isolate, continuation, settled)
{console.log("CHECKING " + settled);
    //if (continuation.descendantReferences.intersect(settled).size <= 0)
    //    return [isolate, continuation, settled];
/*
    until (
        ([, continuation]) => continuation.descendantReferences.intersect(settled).size <= 0,
        ([isolate, continuation, settled]) =>
            continuation.memoizedChildren.mapAccum?(([isolate, settled], child) =>
    
        Task.Continuation.settle(isolate, child, settled),
        [isolate, settled], child)

    const intersection = references.intersect(settled);

    if (intersection.size <= 0)
        return [isolatee, continuation, settled];

    // Need execution ID to retrieve instruction?
    // Or do we just do Continuation -> Instruction
    [isolate, continuation, unblocked] =
    intersection.reduce((UUID) =>
        references.remove(UUID),
        completed(isolate,
            continuation,
            continuation.instruction,
                // instructions for UUID 
            continuation.dependentsFor(UUID) {name, result}
            
        ) )
        
    [] = update(unblocked);

    // even if non-memoized?
    iff(continuation === Task.Success or Task.Failure)
        return [isolate, etc., settled.push(me)];

    return [isolate, continuation, settled];*/
}

// update(root, [CA, value] )
//    for_all_keys_matching(CA) -> fill out -> but on reeturn continue, etc.
//    all-CAs I care about?

/*

Success/Failure

Called
value
Promise



    const { opcode, execute } = 
    const [type, value] = execute.call(thisArg, scope);

    return [step, complete, branch](continuation, instruction)

    if (type === 0)
    {
        const uScope = extend(scope, value);
        const uCompleted = DenseIntSet.add(first, continuation.completed);
        const uUnblocked = DenseIntSet.reduce(
            (unblocked, index) =>
                DenseIntSet.isSubsetOf(uCompleted,
                    instructions[index].dependencies) ?
                DenseIntSet.add(index, unblocked) :
                unblocked,
            instruction.dependents,
            unblocked);
        const uContinuation = Task.Continuation({
            ...continuation,
            completed:uCompleted,
            unblocked:uUnblocked });

        return [uContinuation, isolate];
    }
    
    return [Task.Continuation({
            ...continuation,
            unblocked }), isolate];

// memos, concurrency, running
/*
Task.Graph.reduce = function reduce(graph, isolate, ready)
{
    if (ready.length <= 0)
        return [graph, isolate];

    const [uGraph, uIsolate, dependents] = ready
        .reduce(run, [graph, isolate, DenseIntSet.Empty]);
    const uCompleted = uGraph.completed;
    const uReady = DenseIntSet
        .toArray(dependents)
        .filter(index => DenseIntSet
            .isSubsetOf(uCompleted, nodes.get(index).dependencies));

    return reduce(uGraph, uReady, uIsolate);
}
*/

/*
const Dependent = require("./dependent");
const Independent = require("./independent");

function toPromiseThen(onResolve, onReject)
{
    return require("@cause/cause/to-promise")(Object, this).then(onResolve, onReject);
}

function toPromiseCatch(onReject)
{
    return require("@cause/cause/to-promise")(Object, this).catch(onReject);
}*/
