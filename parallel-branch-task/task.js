const until = require("@climb/until");
const { data, any, string, or, boolean, object, is, number, array, type } = require("@algebraic/type");
const maybe = require("@algebraic/type/maybe");
const Optional = require("@algebraic/type/optional");
const { List, OrderedMap, Map, Set } = require("@algebraic/collections");
const union = require("@algebraic/type/union-new");
const { KeyPathsByName } = require("@algebraic/ast/key-path");
const getContentAddressOf = require("@algebraic/type/content-address-of");
const DenseIntSet = require("@algebraic/dense-int-set");

const BindingName       =   string;
const ContentAddress    =   string;


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
    value               =>  any,
    ([waitingLeaves])   =>  data.always (KeyPathsByName.None),
    ([referenceLeaves]) =>  data.always (KeyPathsByName.None) );

Task.Failure            =   data `Task.Failure` (
    name                =>  [Task.Identifier, "hi"],
    errors              =>  List(any),
    ([waitingLeaves])   =>  data.always (KeyPathsByName.None),
    ([referenceLeaves]) =>  data.always (KeyPathsByName.None) );


Task.Instruction            =   data `Task.Instruction` (
    opcode                  =>  number,
    address                 =>  number,
    dependencies            =>  Array /*DenseIntSet*/,
    dependents              =>  Array /*DenseIntSet*/,
    execute                 =>  Function );

Task.Definition             =   data `Task.Definition` (
    instructions            =>  array(Task.Instruction),
    ([complete])            =>  [Array, instructions =>
                                    DenseIntSet.inclusive(instructions.length)],
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

Task.Continuation           =   data `Task.Continuation` (
    definition              =>  Task.Definition,
    instructions            =>  array(Task.Instruction),
    scope                   =>  Task.Scope,
    completed               =>  [Array /*DenseIntSet*/, DenseIntSet.Empty],

    queued                  =>  [InvocationMap, InvocationMap()],
    references              =>  [Set(ContentAddress), Set(ContentAddress)()],
    children                =>  [ContinuationMap, ContinuationMap()],
    dependents              =>  [DependentMap, DependentMap()],
    ([running])             =>  [boolean, (references, children) =>
                                    references.size + children.size > 0],

    errors                  =>  [List(any), List(any)()],
    result                  =>  [maybe(any), maybe(any).nothing] );


const ContinuationMap = Map(ContentAddress, Task.Continuation);
const DependentMap = Map(ContentAddress, Dependents);
const InvocationMap = OrderedMap(ContentAddress, Task.Invocation);


Task.Reference              =   data `Task.Reference` (
    name                    =>  string,
    invocation              =>  Invocation,
    ([contentAddress])      =>  [string, invocation =>
                                    getContentAddressOf(invocation)] );

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

Task.Instruction.deserialize = function (serialized, address)
{
    const [opcode, dependencies, dependents, execute] = serialized;
    const fields = { opcode, dependencies, dependents, execute, address };

    return Task.Instruction(fields);
}

Task.Continuation.start = function (isolate, { definition, scope })
{
    const { entrypoints, instructions } = definition;
    const continuation = Task.Continuation({ definition, instructions, scope });

    return Task.Continuation.update(isolate, continuation, entrypoints);
}

Task.Continuation.update = function update(isolate, continuation, unblocked)
{
    const [uIsolate, uContinuation] = until(
        ([,, unblocked]) => DenseIntSet.isEmpty(unblocked),
        ([isolate, continuation, unblocked]) =>
        {
            // We can get success with running stuff...
            if (is (Task.Success, continuation))
                return [isolate, continuation, DenseIntSet.Empty];

            const [address, restUnblocked] = DenseIntSet.first(unblocked);
            const instruction = continuation.instructions[address];
            const operation = [step, resolve, branch][instruction.opcode];
            const [uIsolate, uContinuation, dependents] =
                operation(isolate, continuation, instruction);
            const uUnblocked = DenseIntSet.union(restUnblocked, dependents);

            return [uIsolate, uContinuation, uUnblocked];
        }, [isolate, continuation, unblocked]);

    const failed =
        uContinuation.errors.size > 0 &&
        uContinuation.running.size <= 0;

    if (failed)
        return [uIsolate, Task.Failure({ errors })];

    const complete = continuation.definition.complete;
    const succeeded = DenseIntSet.equals(complete, uContinuation.completed);
//console.log(complete, uContinuation.completed, continuation.instructions.length);
    if (succeeded)
        return [uIsolate, Task.Success({ value:
                uContinuation.result === maybe(any).nothing ?
                void(0) : uContinuation.result.value })];

    return [uIsolate, uContinuation];
}

function step(isolate, continuation, instruction)
{
    const dScope = evaluate(continuation, instruction);
console.log(updateScope(continuation, instruction, dScope)[0].scope);
    return [isolate, ...updateScope(continuation, instruction, dScope)];
}

function resolve(isolate, continuation, instruction)
{
    const value = evaluate(continuation, instruction);
    const result = maybe(any).just({ value });
    const uCompleted =
        DenseIntSet.add(instruction.address, continuation.completed);
    const uContinuation =
        Task.Continuation({ ...continuation, completed:uCompleted, result });

    return [isolate, uContinuation, DenseIntSet.Empty];
}

function branch(isolate, continuation, instruction)
{
    const [name, sInvocation] = evaluate(continuation, instruction);
    const invocation = Invocation.deserialize(sInvocation);
    const contentAddress = getContentAddressOf(invocation);
    
    // FIXME: HANDLE ERROR
    // The simplest case is that *someone else* has already encountered this
    // invocation, and it has been fully resolved. In this case, we essentially
    // function identically as a synchronous instruction, and return the updated
    // continuation.
    if (isolate.memoizations.has(contentAddress))
    {
        const result = isolate.memoizations.get();
        const Δbindings = { [name]: result.value };

        return [isolate, ...updateScope(continuation, instruction, Δbindings)];
    }

    const addresses = instruction.dependents;
    const bindings = Set(string)([name]);
    const dependents = Dependents({ addresses, bindings });

    const uDependents = continuation.dependents
        .update(contentAddress, false, existing =>
            Dependents.union(existing, dependents));

    // The second simplest case is that we've already encountered this
    // invocation internally, so we only have to update the dependent
    // information.
    if (continuation.queued.has(contentAddress) ||
        continuation.references.has(contentAddress) ||
        continuation.children.has(contentAddress))
        return [isolate,
            Δ(continuation, { dependents:uDependents }),
            DenseIntSet.Empty];

    // Next we check if it's currently running, where we can't swap it in yet,
    // so we have to add it as a reference.
    if (isolate.running.has(contentAddress))
    {
        const uReferences = continuation.references.add(contentAddress);
        const uContinuation = Δ(continuation,
            { dependents:uDependents, references:uReferences });

        return [isolate, uContinuation, DenseIntSet.Empty];
    }

    const uQueued = continuation.queued.set(contentAddress, invocation);
    const uContinuation =
        Δ(continuation, { queued: uQueued, dependents: uDependents });

    return [isolate, uContinuation, DenseIntSet.Empty];

/*
    if (continuation.

    const uQueued = continuation.queued.has(contentAddress) ?
        continuation.queued :
        continuation.queued.set(contentAddress, invocation);
    const uReferences = continuation

        .update()
    
    queued                  =>  [InvocationMap, InvocationMap()],
    references              =>  [Set(ContentAddress), Set(ContentAddress)()],
    children                =>  [ContinuationMap, ContinuationMap()],
    dependents              =>  [DependentMap, DependentMap()],
    
    const reference = Task.Reference({ name, invocation });

    const Isolate = type.of(isolate);

    if (isolate.memoizations.has(contentAddress))
    {
        
    }

    if (isolate.running.has(reference.contentAddress))
    {
        const uReferenced =
            continuation.referenced.set(contentAddress, reference);
        const uContinuation =
            Task.Continuation({ ...continuation, referenced: uReferenced });

        return [isolate, uContinuation, DenseIntSet.Empty];
    }

    if (isolate.concurrency <= isolate.running.size)
    {
        const uQueued = continuation.queued.set(contentAddress, reference);
        const uContinuation =
            Task.Continuation({ ...continuation, queued:uQueued });

        return [isolate, uContinuation, DenseIntSet.Empty];
    }
    
    const [errored, value] = invoke(invocation);

    if (errored)
    {
        const failure = Task.Failure.from(value);
        const uMemoizations =
            isolate.memoizations.set(contenetAddress, failure);

        const uIsolate = Isolate({ ...isolate, memoizations: uMemoizations });
        const uContinuation = fail(continuation, contentAddress, failure);

        return [uIsolate, uContinuation, DenseIntSet.Empty];
    }

    if (isThenable(value))
    {
        
        const uRunning = continuation.running.set(name, reference);
        const uContinuation =
            Task.Continuation({ ...continuation, running: uRunning });
    
        
    }

    if (!errored && isThenable(value))
    {
    }

    if (!errored && is (Task.Called, value))
    {
    }



    const finished = errored || !isThenable(value) && !is (Task.Called);
    
    
    if (errored)
        isolate.memoizations.
    
console.log("hi...");
    const [uIsolate, task] = invoke(isolate, invocation);
    const uRunning = continuation.running.set(name, task);
    const uContinuation =
        Task.Continuation({ ...continuation, running: uRunning });

    return [uIsolate, uContinuation, DenseIntSet.Empty];*/
}

function Δ(original, changes)
{
    return type.of(original)({ ...original, ...changes });
}

function updateScope(continuation, instruction, Δbindings)
{
    const { scope, completed, instructions } = continuation;
    const uScope = Scope.extend(scope, Δbindings);
    const uCompleted = DenseIntSet.add(instruction.address, completed);
    const uContinuation = Task
        .Continuation({ ...continuation, scope:uScope, completed:uCompleted });
    const unblocked = DenseIntSet.reduce(
        (unblocked, address) =>
            DenseIntSet.isSubsetOf(uCompleted,
                instructions[address].dependencies) ?
            DenseIntSet.add(address, unblocked) :
            unblocked,
        DenseIntSet.Empty,
        instruction.dependents);

    return [uContinuation, unblocked];
}


function success(continuation, success)
{
    
}

function fail(continuation, contentAddress, failure)
{
    const uErrors = continuation.errors.concat(failure.errors);

    return Task.Continuation({ ...continuation, errors: uErrors });
}

function settle(continuation, result)
{
    if (is (Task.Failure, result))
    {
        const uErrors = continuation.failures.push(value);
        const uContinuation =
            Task.Continuation({ ...continuation, errors: uErrors });

        return [uIsolate, uContinuation, DenseIntSet.Empty];
    }
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
    const { thisArg, bindings } = continuation.scope;

    return instruction.execute.call(thisArg, bindings);
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

        return [true, value];
    }
    catch (value)
    {
        return [false, value];
    }
}

async function ensureAsyncThen(thenable)
{
    return await thenable;
}

function isThenable(value)
{
    return !!value && typeof value.then === "function";
}

module.exports = Task;

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
