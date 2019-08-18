const { data, any, string, or, boolean, object } = require("@algebraic/type");
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
    kind                    =>  any,
    action                  =>  Function );

Task.Graph                  =   data `Task.Graph` (
    nodes                   =>  List(Task.Node),
    thisArg                 =>  any,
    scope                   =>  object,
    completed               =>  [Array, DenseIntSet.Empty],
    open                    =>  [Map(string, string), Map(string, string)()],
    failures                =>  [List(Task.Failure), List(Task.Failure)()] );



Task.Graph.reduce = function reduce(graph, ready)
{
    if (ready.length <= 0)
        return graph;

    const { nodes, thisArg, scope, completed } = graph; console.log(graph);
    const [uCompleted, uScope, dependents] = ready
        .map(index => [index, nodes.get(index)])
        .reduce(([completed, scope, dependents], [index, node]) =>
        [
            DenseIntSet.union(completed, DenseIntSet.just(index)),
            run(node, thisArg, scope),
            DenseIntSet.union(dependents, node.dependents)
        ], [completed, scope, DenseIntSet.Empty]);

    return reduce(
        Task.Graph({ ...graph, scope:uScope, completed:uCompleted }),
        DenseIntSet
            .toArray(dependents)
            .map(index => [index, nodes.get(index).dependencies])
            .filter(([index, dependencies]) =>
                DenseIntSet.isSubsetOf(uCompleted, dependencies))
            .map(([index]) => index));
}

function run(node, thisArg, scope)
{
    if (node.kind === 0)
        return Object.assign(
            Object.create(scope),
            node.action.call(thisArg, scope));

    if (node.kind === 1)
        return Object.assign(
            Object.create(scope),
            node.action.call(thisArg, scope));

    return scope;
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

Task.Failure            =   union `Task.Failure` (
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