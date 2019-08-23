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
    value               =>  any );

Task.Failure            =   data `Task.Failure` (
    name                =>  [Task.Identifier, "hi"],
    errors              =>  List(any) );


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
    UUID                    =>  or (boolean, string),

    scope                   =>  Task.Scope,
    completed               =>  [Array /*DenseIntSet*/, DenseIntSet.Empty],

    queued                  =>  [InvocationMap, InvocationMap()],
    references              =>  [Set(ContentAddress), Set(ContentAddress)()],
    memoizedChildren        =>  [ContinuationMap, ContinuationMap()],
    unmemoizedChildren      =>  [List(Task.Continuation), List(Task.Continuation)()],
    dependents              =>  [DependentMap, DependentMap()],
    ([running])             =>  [boolean, (references, memoizedChildren, unmemoizedChildren) =>
                                    references.size +
                                    memoizedChildren.size +
                                    unmemoizedChildren.size > 0],

    errors                  =>  [List(any), List(any)()],
    result                  =>  [any, void(0)] );


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

Task.Continuation.start = function (isolate, { definition, scope }, UUID)
{
    const { entrypoints, instructions } = definition;
    const continuation =
        Task.Continuation({ UUID, definition, instructions, scope });

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
            const instruction = continuation.instructions[address];
            const operation = [step, resolve, branch][instruction.opcode];
            const [uIsolate, uContinuation, dependents] =
                operation(isolate, continuation, instruction);
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

function step(isolate, continuation, instruction)
{
    const dScope = evaluate(continuation, instruction);

    return [isolate, ...updateScope(continuation, instruction, dScope)];
}

function resolve(isolate, continuation, instruction)
{
    const result = evaluate(continuation, instruction);
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

    // The simplest case is that *someone else* has already encountered this
    // invocation, and it has been fully resolved. In this case, we essentially
    // function identically as a synchronous instruction, and return the updated
    // continuation.
    if (isolate.memoizations.has(contentAddress))
        return completed(isolate, continuation, instruction, name,
            isolate.memoizations.get(contentAddress));

    const addresses = instruction.dependents;
    const bindings = Set(string)([name]);
    const dependents = Dependents({ addresses, bindings });

    const uDependents = continuation.dependents
        .update(contentAddress, false, existing =>
            Dependents.union(existing, dependents));

    // The second simplest case is that we've already encountered this
    // invocation internally, so we only have to update the dependent
    // information.
    if (contentAddress !== false &&
        (continuation.queued.has(contentAddress) ||
        continuation.references.has(contentAddress) ||
        continuation.memoizedChildren.has(contentAddress)))
        return [isolate,
            Δ(continuation, { dependents:uDependents }),
            DenseIntSet.Empty];

    // Next we check if it's currently running, where we can't swap it in yet,
    // so we have to add it as a reference.
    if (isolate.occupied.has(contentAddress))
    {
        const uReferences = continuation.references.add(contentAddress);
        const uContinuation = Δ(continuation,
            { dependents:uDependents, references:uReferences });

        return [isolate, uContinuation, DenseIntSet.Empty];
    }

    // Check if the isolate could support another task.
    if (!isolate.hasVacancy)
    {
        const uQueued = continuation.queued.set(contentAddress, invocation);
        const uContinuation =
            Δ(continuation, { queued: uQueued, dependents: uDependents });

        return [isolate, uContinuation, DenseIntSet.Empty];
    }

    // This means we can invoke.
    const [isThenable, result] = invoke(invocation);

    if (isThenable)
    {
        const slot = uIsolate.free.first();
        const uFree = uIsolate.free.remove(slot);
        const uOccupied = uIsolate.occupied.set(slot, result);
        const uIsolate = Δ(isolate, { free: uFree, occupied: uOccupied });

        const uReferences = continuation.references.add(contentAddress);
        const uContinuation = Δ(continuation,
            { dependents: uDependents, references: uReferences });

        return [uIsolate, uContinuation, DenseIntSet.Empty];
    }

    if (!is (Task.Called, result))
        return completed(isolate, continuation, instruction, name, child);

    // MARK SELF AS RUNNING BEFORE-HAND!
    const [uIsolate, child] =
        Task.Continuation.start(isolate, result, contentAddress);

    if (!is (Task.Continuation, child))
        return completed(uIsolate, continuation, instruction, name, child);

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

function completed(isolate, continuation, instruction, name, result)
{
    if (is (Task.Failure, result))
    {
        const uErrors = continuation.errors.concat(result.errors);
        const uContinuation = Δ(continuation, { errors: uErrors });

        return [isolate, uContinuation, DenseIntSet.Empty];
    }

    const Δbindings = { [name]: result.value };

    return [isolate, ...updateScope(continuation, instruction, Δbindings)];
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
