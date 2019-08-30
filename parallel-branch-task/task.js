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

const Invocation = require("./invocation");
const Scope = require("./scope");
const Statement = require("./statement");

const zeroed = T => [T, T()];
const DIS = DenseIntSet;


const Task              =   union `Task` (
    is                  =>  Task.Waiting,
    or                  =>  Task.Active,
    or                  =>  Task.Completed );

Task.Task               =   Task;

Task.Success            =   data `Task.Success` (
    value               =>  any );

Task.Failure            =   data `Task.Failure` (
    errors              =>  List(any) );

Task.Completed          =   or (Task.Success, Task.Failure);

Task.Running            =   data `Task.Running` (
    EID                 =>  number );

Task.Definition             =   data `Task.Definition` (
    statements              =>  array(Statement),
    ([complete])            =>  [Array, statements =>
                                    DenseIntSet.inclusive(statements.length)],
    entrypoints             =>  Array );

Task.Called                 =   data `Task.Called` (
    definition              =>  Task.Definition,
    scope                   =>  Scope );

// Queued -> CA -> List[References]
// Running -> CA -> List[References]

/*const QueueKey              = or (ContentAddress, number);
const QueueItem             = data `QueueItem` (
    invoaction              =>  Invocation,
    statements              =>  zeroed(List(Statement)) );

const BranchQueue           =   data `BranchQueue` (
    nextUnmemoizedID        =>  [number, 0],
    queue                   =>  [OrderedMap(BranchQueue.Key, ) );*/
// const ContinuationMap = Map(ContentAddress, Task.Continuation);
// const InvocationMap = OrderedMap(ContentAddress, Task.Invocation);

Task.Continuation           =   data `Task.Continuation` (

    EID                     =>  number,
    definition              =>  Task.Definition,
    memoized                =>  [boolean, true],

    scope                   =>  Scope,
    completed               =>  [Array /*DenseIntSet*/, DenseIntSet.Empty],

    children                =>  zeroed(List(Task.Continuation)),
    references              =>  zeroed(Map(number, List(Statement))),

    ([directReferences])    =>  [Array, references =>
                                    DenseIntSet.from([...references.keySeq()])],
    ([indirectReferences])  =>  [Array, children =>
                                    children.reduce((references, child) =>
                                        DenseIntSet.union(
                                            child.indirectReferences,
                                            DenseIntSet.add(EID, references)),
                                        DenseIntSet.Empty)],

    ([running])             =>  [boolean, (children, references) =>
                                    children.size + references.size > 0],

    errors                  =>  zeroed(List(any)),
    result                  =>  [any, void(0)]

//    queued                  =>  [InvocationMap, InvocationMap()],

//    nextQueueID             =>  [number, 0],
//    queued                  =>  zeroed(OrderedMap(QueueKey, List(QueueItem))),
 );

Task.Continuation.start = function (isolate, { definition, scope }, EID)
{
    const { entrypoints } = definition;
    const continuation =
        Task.Continuation({ EID, definition, scope });

    return Task.Continuation.update(isolate, continuation, entrypoints);
}

// proceed
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

    const { definition } = uContinuation;
    const result =
        uContinuation.errors.size > 0 && !uContinuation.running ?
            Task.Failure({ errors: uContinuation.errors }) :
        DenseIntSet.equals(definition.complete, uContinuation.completed) ?
            Task.Success({ value: uContinuation.result }) :
        uContinuation;

    if (result === uContinuation || !isolate.EIDs.has(uContinuation.EID))
        return [uIsolate, result];

    const contentAddress = isolate.EIDs.get(uContinuation.EID);
    const uMemoizations = isolate.memoizations.set(contentAddress, result);

    return [Δ(isolate, { memoizations: uMemoizations }), result];
}

function perform(isolate, continuation, statement)
{
    const { thisArg, bindings } = continuation.scope;
    const { address, block, operation } = statement;
    const [succeeded, result] = attempt(() => block.call(thisArg, bindings));

    // If just executing the block failed, then this might as well be a Step
    // operation.
    if (!succeeded)
        return [isolate, ...fail(continuation, [result])];

    if (operation === Statement.Operation.Step)
        return [isolate, ...updateScope(continuation, statement, result)];

    if (operation === Statement.Operation.Return)
        return [isolate, Δ(continuation,
        {
            completed: DenseIntSet.add(address, continuation.completed),
            result
        }), DenseIntSet.Empty];

    const invocation = Invocation.deserialize(result);

    return branch(isolate, continuation, statement, invocation);
}

function branch(isolate, continuation, statement, invocation)
{
    const contentAddress = getContentAddressOf(invocation);
    const memoizable = !!contentAddress;

    // If there already exists a memoized instance of this, just return that.
    if (memoizable && isolate.memoizations.has(contentAddress))
    {
        const memoized = isolate.memoizations.get(contentAddress);

        if (is (Task.Completed, memoized))
            return [isolate, ...advance(continuation, statement, memoized)];

        return [isolate,
            reference(continuation, statement, memoized.EID),
            DenseIntSet.Empty];
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

    if (!isThenable && is (Task.Completed, result))
        return [isolate, ...advance(continuation, statement, result)];

    const [uIsolate, EID] =
        Isolate.activate(isolate, memoizable && contentAddress);
    const uContinuation = reference(continuation, statement, EID);

    if (isThenable)
        return [Isolate.allot(uIsolate, result, EID),
            uContinuation,
            DenseIntSet.Empty];

    const [uuIsolate, child] = Task.Continuation.start(uIsolate, result, EID);

    if (is (Task.Completed, child))
        return [uuIsolate, ...receive(uContinuation, child, EID)];

    const children = continuation.push(child);
    const uuContinuation = Δ(uContinuation, { children: uChildren });

    return [uuIsolate, uuContinuation, DenseInSet.Empty];
}

function reference(continuation, statement, EID)
{
    const uReferences = continuation.references
        .update(EID, List(Statement)(),
            statements => statements.push(statement));

    return Δ(continuation, { references: uReferences });
}

function receive(continuation, result, EID)
{
    const references = continuation.references;
    const uReferences = references.remove(EID);
    const uContinuation = Δ(continuation, { references: uReferences });
console.log("NOW REFEREENCES: " + uReferences + " " + EID + " " + result);
    return references
        .get(EID, List(Statement)())
        .reduce(accumUnblocked((continuation, statement) =>
            advance(continuation, statement, result)),
            [uContinuation, DenseIntSet.Empty]);
}

function advance(continuation, statement, result)
{
    return is (Task.Failure, result) ?
        fail(continuation, result.errors) :
        updateScope(continuation, statement,
            { [statement.operation.binding]: result.value });
}

function fail(continuation, errors)
{
    const uErrors = continuation.errors.concat(errors);
    const uContinuation = Δ(continuation, { errors: uErrors });

    return [uContinuation, DenseIntSet.Empty];
}

function updateScope(continuation, statement, Δbindings)
{
    const { statements } = continuation.definition;
    const { scope, completed } = continuation;
    const uScope = Scope.extend(scope, Δbindings);
    const uCompleted = DenseIntSet.add(statement.address, completed);
    const uContinuation =
        Δ(continuation, { scope:uScope, completed:uCompleted });
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

function attempt(f)
{
    try { return [true, f()] }
    catch (error) { return [false, error] }
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

// Only I care about completed.
// We have to consider the possibility of things that "get" the wrapped form
// They can be unblocked of course.
// Should we just check for done here instead of update?
Task.Continuation.settle = function settle(isolate, continuation, completed)
{
/*
    if (!DenseIntSet.intersects(DenseIntSet.references, completed.EIDs))
        return;

    const [, [[uCompleted, uIsolate], uChildren]] = until(
        ([handled, [[completed]]]) => handled !== completed,
        ([_, [[completed, isolate], children]]) =>
            [completed, mapAccum(settle, [completed, isolate], children)],
        [Completed.Empty, [[completed, isolate], continuation.children]]);
*/
    const uIsolate = isolate;
//    const uContinuation = continuation;
    const uCompleted = completed;

    const referenced =
        DenseIntSet.intersection(completed.EIDs, continuation.directReferences);
    const [uContinuation, unblocked, nCompleted] = DenseIntSet.reduce(
        accumUnblocked((continuation, EID) =>
            receive(continuation, completed.byEID.get(EID), EID)),
        [continuation, DenseIntSet.Empty, completed],
        referenced);

    const [uuIsolate, uuContinuation] =
        Task.Continuation.update(isolate, uContinuation, unblocked);

    if (is (Task.Completed, uuContinuation))
        return [uuIsolate, uuContinuation,
            uCompleted.set(uContinuation.EID, uuContinuation)];

    return [uuIsolate, uuContinuation, completed];
}

/*EIDCollection()

active = { referencedEIDs, direct { referencedEIDs }, references { EIDs, byEIDs } }
children = { referencedEIDs, direct { referencedEIDs }, references { EIDs, byEIDs } }

references (dependents?) => EIDMap(T)
{
    byEID
    EIDs
}

Children = List { } / EIDs

EIDs total { Children EIDMap }*/


function accumUnblocked(f)
{
    return ([continuation, unblocked], item) =>
        (([uContinuation, dependents]) =>
            [uContinuation, DenseIntSet.union(unblocked, dependents)])
        (f(continuation, item));
}

//                console.log(EID), 0);

        /*
                intersection.reduce((UUID) =>
        references.remove(UUID),
        completed(isolate,
            continuation,
            continuation.instruction,
                // instructions for UUID
            continuation.dependentsFor(UUID) {name, result}

        ) )*/


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
