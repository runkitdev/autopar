const { fNamed } = require("@algebraic/type/declaration");
const { is } = require("@algebraic/type");
const { Task, fromAsync } = require("@cause/task");
const Dependent = require("@cause/task/dependent");
const { isArray } = Array;


module.exports = function depend(callee, ...invocations)
{
    const lifted = false;
    const taskCallee = Task.Success({ value: callee });
    const args = invocations.map(toTask);

    return Dependent.wrap({ lifted, callee: taskCallee, arguments: args });
}

function toTask([signature, args])
{
    const isMember = isArray(signature);
    const f = isMember ? signature[0][signature[1]] : signature;

    return isMember ? f.apply(signature[0], args) : f(...args);
}
