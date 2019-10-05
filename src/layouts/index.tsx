import * as React from "react";
import Helmet from "react-helmet";
import { StaticQuery, graphql } from "gatsby";

import "modern-normalize";
import "../styles/normalize";

import Header from "../components/Header";
import LayoutRoot from "../components/LayoutRoot";
import LayoutMain from "../components/LayoutMain";

interface StaticQueryProps {
  site: {
    siteMetadata: {
      title: string;
      description: string;
      keywords: string;
      image: string;
    };
  };
}

interface IndexProps {
  title?: string;
  description?: string;
  tags?: string[];
}

const mergeMeta = (
  props: IndexProps,
  meta: StaticQueryProps["site"]["siteMetadata"]
) => ({
  title: props.title || meta.title,
  description: props.description || meta.description,
  keywords:
    !!props.tags && props.tags.length > 0
      ? props.tags.join(", ")
      : meta.keywords,
  image: meta.image
});

const IndexLayout: React.FC<IndexProps> = props => (
  <StaticQuery
    query={graphql`
      query IndexLayoutQuery {
        site {
          siteMetadata {
            title
            description
            keywords
            image
          }
        }
      }
    `}
    render={({ site: { siteMetadata } }: StaticQueryProps) => {
      const { title, description, keywords, image } = mergeMeta(
        props,
        siteMetadata
      );
      return (
        <LayoutRoot>
          <Helmet
            title={title}
            meta={[
              { name: "description", content: description },
              { name: "keywords", content: keywords },
              { name: "og:title", content: title },
              { name: "og:type", content: "article" },
              { name: "og:description", content: description },
              { name: "og:image", content: image }
            ]}
          />
          <Header title={siteMetadata.title} />
          <LayoutMain>{props.children}</LayoutMain>
        </LayoutRoot>
      );
    }}
  />
);

export default IndexLayout;
