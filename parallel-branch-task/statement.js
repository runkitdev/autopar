const { data, number, string, boolean } = require("@algebraic/type");
const union = require("@algebraic/type/union-new");
const DenseIntSet = Array;


const Statement     =   data `Statement` (
    address         =>  number,
    dependencies    =>  DenseIntSet,
    dependents      =>  DenseIntSet,
    operation       =>  Operation,
    block           =>  Function );

module.exports      =   Statement;

const Operation     =   union `Operation` (
    is              =>  Operation.Step,
    or              =>  Operation.Return,
    or              =>  Operation.Branch );

Operation.Step      =   data `Operation.Step` ();
Operation.Return    =   data `Operation.Return` ();
Operation.Branch    =   data `Operation.Branch` (
    binding         =>  string,
    wrapped         =>  boolean );

Statement.Operation =   Operation;

Operation.deserialize = function (opcode, ...rest)
{
    return  opcode === 0 ? Operation.Step :
            opcode === 1 ? Operation.Return :
            Operation.Branch({ binding: rest[0], wrapped: rest[1] });
}

Statement.deserialize = function (serialized, address)
{
    const [dependencies, dependents, block, ...rest] = serialized;
    const operation = Operation.deserialize(...rest);

    return Statement({ address, dependencies, dependents, block, operation });
}
