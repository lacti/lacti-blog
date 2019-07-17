import styled from "@emotion/styled";
import * as React from "react";
import { graphql } from "gatsby";
import Page from "../components/Page";
import Container from "../components/Container";
import IndexLayout from "../layouts";
import Tag from "../components/Tag";
import PostDate from "../components/PostDate";

const StyledDate = styled.sub`
  font-size: 1rem;
  font-weight: normal;
  margin-left: 1rem;
`;

const StyledTagsContainer = styled.div`
  margin-bottom: 1rem;
`;

interface PageTemplateProps {
  data: {
    site: {
      siteMetadata: {
        title: string;
        description: string;
        author: {
          name: string;
          url: string;
        };
      };
    };
    markdownRemark: {
      html: string;
      excerpt: string;
      fields: {
        date: string;
      };
      frontmatter: {
        title: string;
        tags: string[];
      };
    };
  };
}

const PageTemplate: React.SFC<PageTemplateProps> = ({
  data: {
    markdownRemark: {
      html,
      fields: { date },
      frontmatter: { title, tags }
    }
  }
}) => (
  <IndexLayout>
    <Page>
      <Container>
        <h1>{title}</h1>
        <StyledTagsContainer>
          <PostDate date={date} />
          {tags.map(tag => (
            <Tag key={tag} tag={tag} />
          ))}
        </StyledTagsContainer>
        {/* eslint-disable-next-line react/no-danger */}
        <div dangerouslySetInnerHTML={{ __html: html }} />
      </Container>
    </Page>
  </IndexLayout>
);

export default PageTemplate;

export const query = graphql`
  query PageTemplateQuery($slug: String!) {
    site {
      siteMetadata {
        title
        description
        author {
          name
          url
        }
      }
    }
    markdownRemark(fields: { slug: { eq: $slug } }) {
      html
      excerpt
      fields {
        date(formatString: "MMMM DD, YYYY")
      }
      frontmatter {
        title
        tags
      }
    }
  }
`;
