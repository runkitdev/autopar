const until = require("@climb/until");
const { data, any, string, or, boolean, object, is, number, array } = require("@algebraic/type");
const Optional = require("@algebraic/type/optional");
const { List, Map } = require("@algebraic/collections");
const union = require("@algebraic/type/union-new");
const { KeyPathsByName } = require("@algebraic/ast/key-path");
const getContentAddressOf = require("@algebraic/type/content-address-of");
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

Task.Instruction            =   data `Task.Instruction` (
    opcode                  =>  number,
    address                 =>  number,
    dependencies            =>  Array /*DenseIntSet*/,
    dependents              =>  Array /*DenseIntSet*/,
    execute                 =>  Function );

Task.Definition             =   data `Task.Definition` (
    instructions            =>  array(Task.Instruction),
    entrypoints             =>  Array);

Task.Reference              =   data `Task.Reference` (
    name                    =>  string,
    invocation              =>  Invocation,
    ([contentAddress])      =>  [string, invocation =>
                                    getContentAddressOf(invocation)] );

Task.Continuation           =   data `Task.Continuation` (
    definition              =>  Task.Definition,
    scope                   =>  object,
    queued                  =>  [List(Task.Reference), List(Task.Reference)()],
    unblocked               =>  [Array, DenseIntSet.Empty],//List(number),
    completed               =>  [Array, DenseIntSet.Empty],
    active                  =>  [Map(string, string), Map(string, string)()],
    errors                  =>  [List(any), List(any)()] );


Task.Instruction.deserialize = function (serialized, address)
{
    const [opcode, dependencies, dependents, execute] = serialized;
    const fields = { opcode, dependencies, dependents, execute, address };

    return Task.Instruction(fields);
}

Task.Continuation.update = function update(continuation, isolate)
{
    if (DenseIntSet.isEmpty(continuation.unblocked))
        return [continuation, isolate];

    return until(
        ([, task]) =>
            !is (Task.Continuation, task) ||
            DenseIntSet.isEmpty(task.unblocked),
        something,
        [isolate, continuation]);
}

function something([isolate, continuation])
{
    if (is (Task.Success, continuation))
        return [isolate, continuation];

    const [first, uUnblocked] = DenseIntSet.first(continuation.unblocked);
    const instruction = continuation.definition.instructions[first];
    const operation = [step, complete, branch][instruction.opcode];

    return operation(isolate, continuation, instruction);
}

function step(isolate, continuation, instruction)
{
    const { scope } = continuation;
    const { instructions } = continuation.definition;
    const uScope = extend(scope, evaluate(continuation, instruction));
    const uCompleted = DenseIntSet.add(address, continuation.completed);
    const uUnblocked = DenseIntSet.reduce(
        (unblocked, address) =>
            DenseIntSet.isSubsetOf(uCompleted,
                instructions[address].dependencies) ?
            DenseIntSet.add(address, unblocked) :
            unblocked,
        instruction.dependents,
        DenseIntSet.remove(instruction.address, continuation.unblocked));

    return [isolate, Task.Continuation(
    {
        ...continuation,
        scope:uScope,
        completed:uCompleted,
        unblocked:uUnblocked
    })];
}

function complete(isolate, continuation, instruction)
{
    const value = evaluate(continuation, instruction);

    return [isolate, Task.Success({ name:"DONE", value })];
}

function branch(isolate, continuation, instruction)
{
    const [name, sInvocation] = evaluate(continuation, instruction);
    const invocation = Invocation.deserialize(sInvocation);
    const contentAddress = getContentAddressOf(invocation);

    if (isolate.running.has(contentAddress))
    {
        const reference = Task.Reference({ name, invocation });
        const referenced =
            continuation.referenced.set(contentAddress, reference);
        const uContinuation =
            Task.Continuation({ ...continuation, referenced });

        return [isolate, uContinuation];
    }

    if (isolate.concurrency >= isolate.running.size)
    {
        const reference = Task.Reference({ name, invocation });
        const queued = continuation.queued.set(contentAddress, reference);
        const uContinuation = Task.Continuation({ ...continuation, queued });

        return [isolate, continuation];
    }

    const [isPromise, task] = invoke(invocation);

    return [isolate, continuation];
}

Invocation.deserialize = function ([signature, args])
{
    const isMemberCall = Array.isArray(signature);
    const thisArg = isMemberCall ? signature[0] : void(0);
    const callee = isMemberCall ? thisArg[signature[1]] : signature;

    return Invocation({ callee, thisArg, arguments: List(any)(args) });
}


function evaluate(continuation, instruction)
{
    return instruction.execute.call(continuation.thisArg, continuation.scope);
}



/*


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

function invoke(invocation)
{
    try
    {
        const { callee, thisArg } = invocation;
        const args = invocation.arguments.toArray();
        const value = callee.apply(thisArg, args);

        if (is (Task, value))
            return [false, result];

        if (!isThenable(value))
            return [false, Task.Success({ name, value })];

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