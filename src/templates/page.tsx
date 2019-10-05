import styled from "@emotion/styled";
import * as React from "react";
import { graphql } from "gatsby";
import Page from "../components/Page";
import Container from "../components/Container";
import IndexLayout from "../layouts";
import Tag from "../components/Tag";
import PostDate from "../components/PostDate";

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
        shortdesc: string;
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
      excerpt,
      fields: { date, shortdesc },
      frontmatter: { title, tags }
    }
  }
}) => (
  <IndexLayout
    title={title}
    description={[shortdesc, excerpt].join("\n")}
    tags={tags}
  >
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
        shortdesc
      }
      frontmatter {
        title
        tags
      }
    }
  }
`;
