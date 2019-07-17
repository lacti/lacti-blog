"use strict";

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
  switch (node.internal.type) {
    case "MarkdownRemark":
      {
        const { permalink, layout } = node.frontmatter;
        const { relativePath } = getNode(node.parent);
        const match = relativePath.match(/(\d{4})-(\d{2})-(\d{2})-(.+)\.md/);
        const [_, y, m, d, name] = match;
        createNodeField({ node, name: `date`, value: `${y}-${m}-${d}` });

        let slug = permalink;
        if (!slug) {
          slug = `/${y}/${m}/${d}/${name}/`;
        }

        createNodeField({ node, name: "slug", value: slug || "" });
        createNodeField({ node, name: "layout", value: layout || "" });
      }
      break;
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
        }
      }
    }
  `);

  if (result.errors) {
    console.error(result.errors);
    throw new Error(result.errors);
  }

  const posts = result.data.allMarkdownRemark.edges;
  posts.forEach(({ node: { fields: { slug, layout } } }) => {
    createPage({
      path: slug,
      component: path.resolve(`./src/templates/${layout || "page"}.tsx`),
      context: {
        slug
      }
    });
  });

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
