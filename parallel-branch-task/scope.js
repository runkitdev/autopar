const { Δ, data, object, any } = require("@algebraic/type");
const { assign, create } = Object;
const EmptyBindings = create(null);


const Scope     =   data `Scope` (
    thisArg     =>  any,
    bindings    =>  object );

module.exports = Scope;

Scope.extend = (scope, newBindings) => 
{
    return Δ(scope, { bindings: assign(create(scope.bindings), newBindings) });
}

Scope.from = function (thisArg, initialBindings)
{
	return Scope({ thisArg, bindings: assign(EmptyBindings, initialBindings) });
}