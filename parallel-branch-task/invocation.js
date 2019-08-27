const { data, any } = require("@algebraic/type");
const { List } = require("@algebraic/collections");


const Invocation        =   data `Invocation` (
    thisArg             =>  any,
    callee              =>  Function,
    arguments           =>  List(any) );

module.exports          =   Invocation;
