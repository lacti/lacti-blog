/* eslint-disable @typescript-eslint/no-var-requires */
const path = require("path");

const encodeTagForURL = tag => {
  switch (tag) {
    case "c++":
      return "cplusplus";
    case "c#":
      return "csharp";
    default:
      return tag;
  }
};

exports.onCreateNode = ({ node, actions, getNode }) => {
  const { createNodeField } = actions;
  if (node.internal.type === "MarkdownRemark") {
    const { permalink, layout, shortdesc } = node.frontmatter;
    const { relativePath } = getNode(node.parent);
    let slug = permalink;

    const match = relativePath.match(/(\d{4})-(\d{2})-(\d{2})-(.+)\.md/);
    if (match) {
      const [, y, m, d, name] = match;
      createNodeField({ node, name: `date`, value: `${y}-${m}-${d}` });

      if (!slug) {
        slug = `/${y}/${m}/${d}/${name}/`;
      }
    }
    createNodeField({ node, name: `isPost`, value: match ? "yes" : "no" });

    createNodeField({ node, name: "slug", value: slug || "" });
    createNodeField({ node, name: "layout", value: layout || "" });
    createNodeField({ node, name: "shortdesc", value: shortdesc || "" });
  }
};

exports.createPages = async ({ graphql, actions }) => {
  const { createPage } = actions;

  const result = await graphql(`
    {
      allMarkdownRemark(
        sort: { order: DESC, fields: [fields___date] }
        limit: 2000
      ) {
        edges {
          node {
            fields {
              layout
              slug
            }
            frontmatter {
              tags
            }
          }
          next {
            fields {
              slug
              isPost
            }
            frontmatter {
              title
            }
          }
          previous {
            fields {
              slug
              isPost
            }
            frontmatter {
              title
            }
          }
        }
      }
    }
  `);

  if (result.errors) {
    console.error(result.errors);
    throw new Error(result.errors);
  }

  const posts = result.data.allMarkdownRemark.edges;
  posts.forEach(
    ({
      node: {
        fields: { slug, layout }
      },
      next,
      previous
    }) => {
      const context = {
        slug,
        older:
          next && next.fields.isPost === "yes"
            ? {
                slug: next.fields.slug,
                title: next.frontmatter.title
              }
            : undefined,
        newer:
          previous && previous.fields.isPost === "yes"
            ? {
                slug: previous.fields.slug,
                title: previous.frontmatter.title
              }
            : undefined
      };
      createPage({
        path: slug,
        component: path.resolve(`./src/templates/${layout || "page"}.tsx`),
        context
      });
    }
  );

  const allTags = Array.from(
    new Set(
      posts
        .map(
          ({
            node: {
              frontmatter: { tags }
            }
          }) => tags
        )
        .reduce((a, b) => a.concat(b), [])
    )
  );
  const tagTemplate = path.resolve(`./src/templates/tag.tsx`);
  allTags.forEach(tag => {
    createPage({
      path: `/tag/${encodeTagForURL(tag)}/`,
      component: tagTemplate,
      context: {
        tag
      }
    });
  });
};
