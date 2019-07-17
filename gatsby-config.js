"use strict";

module.exports = {
  siteMetadata: {
    title: `Lacti's Archive`,
    description: "All about I learned",
    keywords: "lacti, c, c++, c#, java, javascript, typescript",
    siteUrl: "https://lacti.github.io/",
    author: {
      name: "Jaeyoung, Choi",
      url: "https://twitter.com/lacti",
      email: "lactrious@gmail.com"
    }
  },
  plugins: [
    {
      resolve: "gatsby-source-filesystem",
      options: {
        name: "content",
        path: `${__dirname}/src/content`
      }
    },
    {
      resolve: "gatsby-transformer-remark",
      options: {
        plugins: [
          {
            resolve: "gatsby-remark-responsive-iframe",
            options: {
              wrapperStyle: "margin-bottom: 1rem"
            }
          },
          "gatsby-remark-vscode",
          "gatsby-remark-copy-linked-files",
          "gatsby-remark-smartypants",
          {
            resolve: "gatsby-remark-images",
            options: {
              maxWidth: 1140,
              quality: 90,
              linkImagesToOriginal: false
            }
          }
        ]
      }
    },
    "gatsby-transformer-json",
    {
      resolve: "gatsby-plugin-canonical-urls",
      options: {
        siteUrl: "https://gatsby-starter-typescript-plus.netlify.com"
      }
    },
    "gatsby-plugin-emotion",
    "gatsby-plugin-typescript",
    "gatsby-plugin-sharp",
    "gatsby-transformer-sharp",
    "gatsby-plugin-react-helmet"
  ]
};
