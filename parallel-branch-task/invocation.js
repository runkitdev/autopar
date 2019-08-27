const { isArray } = Array;
const { data, any } = require("@algebraic/type");

const { List } = require("@algebraic/collections");
const ArgumentList = List(any);


const Invocation        =   data `Invocation` (
    thisArg             =>  any,
    callee              =>  Function,
    arguments           =>  ArgumentList );

module.exports          =   Invocation;

Invocation.deserialize = function ([signature, args])
{
    const isMemberCall = isArray(signature);
    const thisArg = isMemberCall ? signature[0] : void(0);
    const callee = isMemberCall ? thisArg[signature[1]] : signature;

    return Invocation({ callee, thisArg, arguments: ArgumentList(args) });
}
