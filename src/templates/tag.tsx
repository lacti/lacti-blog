import styled from "@emotion/styled";
import * as React from "react";
import { graphql } from "gatsby";

import Page from "../components/Page";
import Container from "../components/Container";
import IndexLayout from "../layouts";
import PostList from "../components/PostList";

const StyledTitle = styled.h3`
  margin: 0;
  margin-bottom: 2rem;
`;

interface TagsProps {
  pageContext: {
    tag: string;
  };
  data: {
    allMarkdownRemark: {
      totalCount: number;
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
          };
        };
      }[];
    };
  };
}

const TagsTemplate: React.SFC<TagsProps> = ({
  pageContext: { tag },
  data: {
    allMarkdownRemark: { edges, totalCount }
  }
}) => (
  <IndexLayout>
    <Page>
      <Container>
        <StyledTitle>{`${totalCount} posts tagged with ${tag}`}</StyledTitle>
        <PostList
          items={edges.map(
            ({
              node: {
                excerpt,
                fields: { date, slug },
                frontmatter: { title, tags }
              }
            }) => ({ excerpt, date, slug, title, tags })
          )}
        />
      </Container>
    </Page>
  </IndexLayout>
);

export default TagsTemplate;

export const pageQuery = graphql`
  query($tag: String) {
    allMarkdownRemark(
      limit: 2000
      sort: { fields: [fields___date], order: DESC }
      filter: { frontmatter: { tags: { in: [$tag] } } }
    ) {
      totalCount
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
          }
        }
      }
    }
  }
`;
