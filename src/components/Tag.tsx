import * as React from "react";
import styled from "@emotion/styled";
import { Link } from "gatsby";
import { encodeTagForURL } from "../utils/tag";

const StyledContainer = styled.div`
  display: inline-block;
  padding: 4px 8px;
  margin: 4px 4px 4px 4px;
  border-radius: 8px;
  background-color: #f1f1f1;
`;

interface TagProps {
  tag: string;
}

const Tag: React.FC<TagProps> = ({ tag }) => (
  <StyledContainer>
    <Link to={`/tag/${encodeTagForURL(tag)}/`}>{tag}</Link>
  </StyledContainer>
);

export default Tag;
