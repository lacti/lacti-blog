import * as React from "react";
import styled from "@emotion/styled";
import { Link } from "gatsby";
import Tag from "./Tag";
import PostDate from "./PostDate";

const StyledContainer = styled.li`
  margin-bottom: 2rem;
`;

const StyledTitle = styled.h1`
  font-size: 1.8rem;
  margin-bottom: 6px;
  color: blue;
  ["& a"]: {
    text-decoration: none;
  }
`;

const StyledTagsContainer = styled.div`
  margin-bottom: 1rem;
`;

const StyledExcerpt = styled.p`
  word-break: break-all;
`;

export interface PostItemProps {
  excerpt: string;
  slug: string;
  date: string;
  title: string;
  tags: string[];
}

const PostItem: React.FC<PostItemProps> = ({
  excerpt,
  slug,
  title,
  date,
  tags
}) => (
  <StyledContainer>
    <StyledTitle>
      <Link to={slug} title={excerpt}>
        {title}
      </Link>
    </StyledTitle>
    <StyledTagsContainer>
      <PostDate date={date} />
      {tags.map(tag => (
        <Tag key={tag} tag={tag} />
      ))}
    </StyledTagsContainer>
    <StyledExcerpt>{excerpt}</StyledExcerpt>
  </StyledContainer>
);

export default PostItem;
