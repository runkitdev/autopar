const { Δ, is, string, fail } = require("@algebraic/type");
const { List, Set } = require("@algebraic/collections");

const Node = require("@algebraic/ast");
const parse = require("@algebraic/ast/parse");
const KeyPath = require("@algebraic/ast/key-path");

const t = require("./templates");
const generate = node => require("@babel/generator").default(node).code;

const δ = require("./δ");


module.exports = function differentiate(f, bs)
{
    const fExpression = parse.expression(f + "");
    const { id, params: parameters, body } = fExpression;

    const numberedBindings = parameters
        .map(toMaybeIdentifierBinding);
    const namedBindings = parameters
        .reduce((names, parameter) =>
            names.concat(parameter.bindingNames.keys()),
            Set(string)(id ? [id.name] : []));

    const fromNumberedBinding = index =>
        numberedBindings[index] === false ?
            fail(`Can't take the branching derivative of ${f.name} with respect` +
                `to ${index} because no single parameter was found there.`) :
            numberedBindings[index];
    const fromNamedBinding = name =>
        namedBindings.has(name) ?
            fail(`Can't take the branching derivative of ${f.name} with respect ` +
                `to "${name}" because no parameter was found with that name.`) :
            name;

    const variables = bs
        .map(b =>
            typeof b === "number" ? fromNumberedBinding(b) :
            typeof b === "string" ? fromNamedBinding(b) :
            fail(`Branching derivatives can only be taken with respect to ` +
                `named or indexed parameter`));
console.log(variables);
    const uBody = variables
        .reduce((body, variable) =>
            body.freeVariables
                .get(variable, List(KeyPath)())
                .reduce((body, keyPath) =>
                    KeyPath.update(t.branch, keyPath, body),
                    body),
            body);
    const dfExpression = Δ(fExpression, { body: uBody });
    const transformed = require("./differentiate")(dfExpression);
	const instantiate = new Function("δ", `return ${generate(transformed)}`);

    return instantiate(δ);
}

function toMaybeIdentifierBinding(pattern)
{
    if (is (Node.IdentifierPattern, pattern))
        return pattern.name;

    if (is (Node.AssignmentPattern, pattern))
        return toMaybeIdentifierBinding(pattern.left);

    return false;
}