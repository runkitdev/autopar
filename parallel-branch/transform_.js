const differentiate = require("./differentiate");


module.exports.function = (function ()
{
    const parse = require("@algebraic/ast/parse");
    const generate = node => require("@babel/generator").default(node).code;

    return function (f)
    {
        const transformed = differentiate(parse.expression(f + ""));
        const instantiate = new Function("δ", `return ${generate(transformed)}`);

        return instantiate(require("./δ"));
    }
})();
