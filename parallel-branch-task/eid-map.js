const { data, number, any } = require("@algebraic/type");
const { Map } = require("@algebraic/collections");
const DenseIntSet = require("@algebraic/dense-int-set");

const EIDMap = data `EIDMap` (
    byEID       => [Map(number, any), Map(number, any)()],
    EIDs        => [Array, DenseIntSet.Empty],
    ([size])    => [number, byEID => byEID.size]);

module.exports = EIDMap;

EIDMap.prototype.set = function (EID, value)
{
    const uByEID = this.byEID.set(EID, value);
    const uEIDs = DenseIntSet.add(EID, this.EIDs);

    return EIDMap({ byEID: uByEID, EIDs: uEIDs });
}

EIDMap.prototype.remove = function (EID, value)
{
    const uByEID = this.byEID.remove(EID, value);
    const uEIDs = DenseIntSet.remove(EID, this.EIDs);

    return EIDMap({ byEID: uByEID, EIDs: uEIDs });
}

EIDMap.prototype.get = function (EID)
{
    return this.byEID.get(EID);
}

EIDMap.prototype.update = function (EID, missing, update)
{
    const uByEID = this.byEID.update(EID, missing, update);
    const uEIDs = DenseIntSet.add(EID, this.EIDs);

    return EIDMap({ byEID: uByEID, EIDs: uEIDs });
}

EIDMap.Empty = EIDMap();

EIDMap.of = function (EID, value)
{
    return EIDMap.Empty.set(EID, value);
}
