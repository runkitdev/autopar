const until = require("@climb/until");
const { data, any, string, or, boolean, object, is, number } = require("@algebraic/type");
const Optional = require("@algebraic/type/optional");
const { List, Map } = require("@algebraic/collections");
const union = require("@algebraic/type/union-new");
const { KeyPathsByName } = require("@algebraic/ast/key-path");
const ContentAddressOf = require("@algebraic/type/content-address-of");
const DenseIntSet = require("@algebraic/dense-int-set");


const Task              =   union `Task` (
    is                  =>  Task.Waiting,
    or                  =>  Task.Active,
    or                  =>  Task.Completed );

Task.Task               =   Task;
Task.Identifier         =   Optional(string);

const Invocation        =   data `Invocation` (
    thisArg             =>  any,
    callee              =>  Function,
    arguments           =>  List(any),
    memoizable          =>  [boolean, true] );
Task.Invocation = Invocation;
Task.Node                   =   data `Task.Node` (
    dependencies            =>  Array /*DenseIntSet*/,
    dependents              =>  Array /*DenseIntSet*/,
    action                  =>  Function );


Task.Definition             =   data `Task.Definition` (
    instructions            =>  List(Task.Node),
    entrypoints             =>  Array );

Task.Continuation           =   data `Task.Continuation` (
    definition              =>  Task.Definition,
    scope                   =>  object,
    unblocked               =>  [Array, DenseIntSet.Empty],//List(number),
    completed               =>  [Array, DenseIntSet.Empty],
    active                  =>  [Map(string, string), Map(string, string)()],
    errors                  =>  [List(any), List(any)()] );



Task.Continuation.update = function update(continuation, isolate)
{
    if (DenseIntSet.isEmpty(continuation.unblocked))
        return [continuation, isolate];

    return until(
        ([continuation]) => DenseIntSet.isEmpty(continuation.unblocked),
        something,
        [continuation, isolate]);
}

function something([continuation, isolate])
{
    const { instructions } = continuation.definition;
    const [first, unblocked] = DenseIntSet.first(continuation.unblocked);

    const { scope, thisArg } = continuation;
    const instruction = instructions.get(first);
    const [type, value] = instruction.action.call(thisArg, scope);

    if (type === 0)
    {
        const uScope = extend(scope, value);
        const uCompleted = DenseIntSet.add(first, continuation.completed);
        const uUnblocked = DenseIntSet.reduce(
            (unblocked, index) =>
                DenseIntSet.isSubsetOf(uCompleted,
                    instructions.get(index).dependencies) ?
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
}

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
const extend = (prototype, properties) =>
    Object.assign(Object.create(prototype), properties);

function run([graph, dependents], index)
{
    if (is (Task.Success, graph))
        return [graph, dependents];

    try
    {
        const node = graph.nodes.get(index);
        const scope = graph.scope;
        const [type, value] = node.action.call(graph.thisArg, scope);

        if (type === 0)
            return [
                Task.Graph({ ...graph, scope: extend(scope, value) }),
                DenseIntSet.union(dependents, node.dependents)];

        // Nothing for now.
        if (type === 1)
        {
//            const result = invoke(value);

            return [graph, dependents];
        }

        //if (type === 2)
        return [Task.Success({ name:"", value }), dependents];
    }
    catch (error)
    {
        const failure = Task.Failure({ errors: List(any)([error]) });
        const failures = graph.failures.push(failure);

        return [Task.Graph({ ...graph, failures }), dependents];
    }
}

function invoke(graph, [signature, args])
{
    try
    {
        const isMemberCall = isArray(signature);
        const thisArg = isMemberCall ? signature[0] : void(0);
        const f = isMemberCall ? thisArg[signature[1]] : signature;
        const value = f.apply(thisArg, args);
        //const memoizable = ...;

        if (is (Task, value))
            return [false, result];

        if (!isThenable(value))
            return [false, Task.Success({ name, value })];

        const id = Invocation();
        const promise = ensureAsyncThen(value);

        return [promise, Task.Reference({ id })];
    }
    catch (value)
    {
        return Task.Failure({ errors:[value] });
    }
}

/*
Task.Pipeline           =   data `Task.Pipeline` (
    );

Task.Pipelined          =>  data `Task.Pipelined` (
    invocation          =>  Invocation,
    ([name])            =>  [string, invocation => invocation.callee.name],
    ([contentAddress])  =>  [string, invocation => ContentAddressOf(invocation)] ),

Task.Graph              =>  data `Task.Graph` (
    completed           =>  DenseIntSet,
    items               =>  List(),
    waiting             =>  List(),
    running             =>  List(),
    );
*/
Task.Success            =   data `Task.Success` (
    name                =>  Task.Identifier,
    value               =>  any,
    ([waitingLeaves])   =>  data.always (KeyPathsByName.None),
    ([referenceLeaves]) =>  data.always (KeyPathsByName.None) );

Task.Failure            =   data `Task.Failure` (
    name                =>  Task.Identifier,
    errors              =>  List(any),
    ([waitingLeaves])   =>  data.always (KeyPathsByName.None),
    ([referenceLeaves]) =>  data.always (KeyPathsByName.None) );



Task.Reference          =   data `Task.Reference` (
    name                =>  Task.Identifier,
    contentAddress      =>  string,
    ([waitingLeaves])   =>  data.always (KeyPathsByName.None),
    ([referenceLeaves]) =>  KeyPathsByName.compute(take => `contentAddress`) );

Task.Active             =   union `Task.Active` (
    is                  =>  Dependent.Blocked,
    or                  =>  Dependent.Unblocked,
    or                  =>  Task.Running,
    or                  =>  Task.Reference );

Task.Completed          =   union `Task.Completed` (
    is                  =>  Task.Success,
    or                  =>  Task.Failure );

Task.Success            =   data `Task.Success` (
    name                =>  Task.Identifier,
    value               =>  any,
    ([waitingLeaves])   =>  data.always (KeyPathsByName.None),
    ([referenceLeaves]) =>  data.always (KeyPathsByName.None) );

Task.Failure            =   union `Task.Failure` (
    is                  =>  Task.Failure.Direct,
    or                  =>  Task.Failure.Aggregate );

Task.Failure.Direct     =   data `Task.Failure.Direct` (
    name                =>  [Task.Identifier, Optional.None],
    value               =>  any,
    ([waitingLeaves])   =>  data.always (KeyPathsByName.None),
    ([referenceLeaves]) =>  data.always (KeyPathsByName.None) );

Task.Failure.Aggregate  =   data `Task.Failure.Aggregate` (
    name                =>  Task.Identifier,
    failures            =>  List(Task.Failure),
    ([waitingLeaves])   =>  data.always (KeyPathsByName.None),
    ([referenceLeaves]) =>  data.always (KeyPathsByName.None) );

module.exports = Task;

const TaskReturningSymbol = Symbol("@cause/task:task-returning");

Task.taskReturning = f => Object.assign(f, { [TaskReturningSymbol]: true });
Task.isTaskReturning = f => !!f[TaskReturningSymbol];

const Dependent = require("./dependent");
const Independent = require("./independent");

function toPromiseThen(onResolve, onReject)
{
    return require("@cause/cause/to-promise")(Object, this).then(onResolve, onReject);
}

function toPromiseCatch(onReject)
{
    return require("@cause/cause/to-promise")(Object, this).catch(onReject);
}

for (const type of [
    Independent.Waiting,
    Independent.Running,
    Dependent.Blocked,
    Dependent.Unblocked,
    //...union.components(Independent),
    //...union.components(Dependent),
    ...union.components(Task.Failure),
    Task.Success])
{
    type.prototype.then = toPromiseThen;
    type.prototype.catch = toPromiseCatch;
}


Task.fromAsync = function (fAsync)
{
    return Task.taskReturning((...args) =>
        Task.fromAsyncCall(null, fAsync, args));
}

Task.fromAsyncCall =
Task.fromResolvedCall = Independent.fromResolvedCall;


/*
Task.Waiting.from = (callee, args) =>
    Task.Waiting({ invocation:
        Invocation({ callee, arguments:List(any)(args) }) });

*/