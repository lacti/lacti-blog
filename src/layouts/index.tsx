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
    };
  };
}

interface IndexProps {
  title?: string;
  description?: string;
  tags?: string[];
}

const IndexLayout: React.FC<IndexProps> = ({
  title,
  description,
  tags,
  children
}) => (
  <StaticQuery
    query={graphql`
      query IndexLayoutQuery {
        site {
          siteMetadata {
            title
            description
          }
        }
      }
    `}
    render={(data: StaticQueryProps) => (
      <LayoutRoot>
        <Helmet
          title={title || data.site.siteMetadata.title}
          meta={[
            {
              name: "description",
              content: description || data.site.siteMetadata.description
            },
            {
              name: "keywords",
              content:
                !!tags && tags.length > 0
                  ? tags.join(", ")
                  : data.site.siteMetadata.keywords
            }
          ]}
        />
        <Header title={data.site.siteMetadata.title} />
        <LayoutMain>{children}</LayoutMain>
      </LayoutRoot>
    )}
  />
);

export default IndexLayout;
