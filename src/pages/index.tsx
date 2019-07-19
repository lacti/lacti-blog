import * as React from "react";
import { graphql } from "gatsby";
import Page from "../components/Page";
import Container from "../components/Container";
import IndexLayout from "../layouts";
import PostList from "../components/PostList";

interface IndexPageProps {
  data: {
    allMarkdownRemark: {
      edges: {
        node: {
          excerpt: string;
          fields: {
            slug: string;
            date: string;
          };
          frontmatter: {
            title: string;
            tags: string[];
            permalink: string;
          };
        };
      }[];
    };
  };
}

const IndexPage: React.FC<IndexPageProps> = ({
  data: {
    allMarkdownRemark: { edges }
  }
}) => (
  <IndexLayout>
    <Page>
      <Container>
        <PostList
          items={edges
            .filter(edge => !edge.node.frontmatter.permalink)
            .map(
              ({
                node: {
                  excerpt,
                  fields: { slug, date },
                  frontmatter: { title, tags }
                }
              }) => ({ excerpt, slug, date, title, tags })
            )}
        />
      </Container>
    </Page>
  </IndexLayout>
);

export default IndexPage;

export const pageQuery = graphql`
  {
    allMarkdownRemark(
      sort: { order: DESC, fields: [fields___date] }
      limit: 2000
    ) {
      edges {
        node {
          excerpt(pruneLength: 240)
          fields {
            date(formatString: "MMMM DD, YYYY")
            slug
          }
          frontmatter {
            title
            tags
            permalink
          }
        }
      }
    }
  }
`;
