export default function ({ types: t }) {
  // is `class extends React.Component`?
  function isReactClass(node) {
    const superClass = node.superClass;
    return (
      t.isMemberExpression(superClass) &&
      t.isIdentifier(superClass.object, { name: 'React' }) &&
      t.isIdentifier(superClass.property, { name: 'Component' })
    );
  }

  const bodyVisitor = {
    ClassMethod(path) {
      if (path.node.key.name === 'render') {
        this.renderMethod = path;
      } else {
        this.isPure = false;
        path.stop();
      }
    },

    ClassProperty(path) {
      const name = path.node.key.name;

      if (path.node.static && (
        name === 'propTypes' ||
        name === 'defaultProps'
      )) {
        this.properties.push(path);
      } else {
        this.isPure = false;
      }
    },

    MemberExpression(path) {
      const { node } = path;

      // non-this member expressions dont matter
      if (!t.isThisExpression(node.object)) {
        return;
      }

      // Don't allow this.<anything other than props>
      if (!t.isIdentifier(node.property, { name: 'props' })) {
        this.isPure = false;
        path.stop();
        return;
      }

      // this.props.foo => props.foo
      this.thisProps.push(path);
    }
  };

  return {
    visitor: {
      Class(path) {
        if (!isReactClass(path.node)) {
          // yo, fuck this class then.
          return;
        }

        const state = {
          renderMethod: null,
          properties: [],
          thisProps: [],
          isPure: true
        };

        // get the render method and make sure it doesn't have any other methods
        path.traverse(bodyVisitor, state);

        if (!state.isPure || !state.renderMethod) {
          // fuck this class too.
          return;
        }

        const id = t.identifier(path.node.id.name);

        let replacement = [];

        state.thisProps.forEach(function(thisProp) {
          thisProp.replaceWith(t.identifier('props'));
        });

        replacement.push(
          t.functionDeclaration(
            id,
            [t.identifier('props')],
            state.renderMethod.node.body
          )
        );

        state.properties.forEach(prop => {
          replacement.push(t.expressionStatement(
            t.assignmentExpression('=',
              t.MemberExpression(id, prop.node.key),
              prop.node.value
            )
          ));
        });

        if (t.isExpression(path.node)) {
          replacement.push(t.returnStatement(id));

          replacement = t.callExpression(
            t.functionExpression(null, [],
              t.blockStatement(replacement)
            ),
            []
          );
        }

        path.replaceWithMultiple(
          replacement
        );
      }
    }
  };
}
