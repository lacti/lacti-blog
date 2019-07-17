import * as React from "react";
import styled from "@emotion/styled";

const StyledDate = styled.span`
  display: inline-block;
  font-size: 1rem;
  font-weight: 500;
  display: inline-block;
  margin: 4px;
`;

export interface PostDateProps {
  date: string;
}

const PostDate: React.FC<PostDateProps> = ({ date }) => (
  <StyledDate>{date}</StyledDate>
);

export default PostDate;
