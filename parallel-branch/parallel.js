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

    const freeVariables = body.freeVariables;
    const uBody = variables
        .reduce((body, variable) => freeVariables
            .get(variable, List(KeyPath)())
            .reduce((body, keyPath) =>
                KeyPath.updateJust((node, remaining) =>
                    is (Node.CallExpression, node) ?
                        t.branch(node) :
                        KeyPath.update(t.branching, remaining, node),
                    -1, keyPath, body),
                body),
            body);

    // We don't want this function to have the same name as the original,
    // because then it would shadow a reference to the original function.
    const dfExpression = Δ(fExpression, { id: null, body: uBody });
    const transformed = require("./differentiate")(dfExpression);

	const instantiate = new Function(
	   ["δ", ...(id ? [id.name] : [])],
	   `return ${generate(transformed)}`);

    return instantiate(δ, f);
}
/*
function _(keyPath, body)
{
    return KeyPath.updateJust(-1, keyPath, body)
    const [ancestor, remaining] = KeyPath.getJust(-1, keyPath, body);
    
    
    const targetCall = ancestor.arguments[0];

    if ()

    const isWrapped = targetCall.callee.name === "wrapped";
    const trueCall = isWrapped ? targetCall.arguments[0] : targetCall;
    const trueCallee = trueCall.callee;
    const receiver = !is (Node.MemberExpression, trueCallee) ?
        trueCallee :
        toArrayExpression(
            trueCallee.object,
            is (Node.ComputedMemberExpression, trueCallee) ?
                trueCallee.property :
                Node.StringLiteral({ value: trueCallee.property.name }));

    const invocation =
        toArrayExpression(receiver, toArrayExpression(...trueCall.arguments));

    return [-1, invocation, ancestor, isWrapped];
    
    KeyPath.updateJust(keyPath, -1)
}
*/
function toMaybeIdentifierBinding(pattern)
{
    if (is (Node.IdentifierPattern, pattern))
        return pattern.name;

    if (is (Node.AssignmentPattern, pattern))
        return toMaybeIdentifierBinding(pattern.left);

    return false;
}