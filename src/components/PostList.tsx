import * as React from "react";
import styled from "@emotion/styled";
import PostItem, { PostItemProps } from "./PostItem";

const StyledList = styled.ul`
  list-style: none;
  margin: 0;
  padding: 0;
`;

const PostList: React.FC<{ items: PostItemProps[] }> = ({ items }) => (
  <StyledList>
    {items.map(item => (
      <PostItem key={item.slug} {...item} />
    ))}
  </StyledList>
);

export default PostList;
