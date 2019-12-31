import styled from "@emotion/styled";
import ReactUtterences from "react-utterances";
import * as React from "react";
import { graphql, Link } from "gatsby";
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
        slug: string;
      };
      frontmatter: {
        title: string;
        tags: string[];
      };
    };
  };
  pageContext: {
    slug: string;
    older?: {
      title: string;
      slug: string;
    };
    newer?: {
      title: string;
      slug: string;
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
  },
  pageContext: { older, newer }
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
      <Container>
        {older && (
          <Link
            to={older.slug}
            style={{ float: "left" }}
          >{`< ${older.title}`}</Link>
        )}
        {newer && (
          <Link
            to={newer.slug}
            style={{ float: "right" }}
          >{`${newer.title} >`}</Link>
        )}
      </Container>
    </Page>
    <ReactUtterences repo="lacti/lacti.github.io" type="title" />
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
        slug
      }
      frontmatter {
        title
        tags
      }
    }
  }
`;
