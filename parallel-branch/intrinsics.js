const { is, maybe, string } = require("@algebraic/type");
const { Intrinsic } = require("@algebraic/ast");

const toKeywordIntrinsic = ([keyword]) =>
    Intrinsic({ name: `δ.${keyword}`, keyword });
const toPrivateIntrinsic = ([name]) => Intrinsic({ name });        

const Intrinsics =
{
    Apply: toPrivateIntrinsic `apply`,
    Branch: toKeywordIntrinsic `branch`,
    Branching: toKeywordIntrinsic `branching`,
}


module.exports = Object.assign(Intrinsics, 
{
    KeywordAccessible: Object
        .fromEntries(Object
            .entries(Intrinsics)
            .filter(([name, intrinsic]) => !!intrinsic.keyword)
            .map(([name, intrinsic]) => [name, intrinsic]))
});
