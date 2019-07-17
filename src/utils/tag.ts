export const encodeTagForURL = (tag: string) => {
  switch (tag) {
    case "c++":
      return "cplusplus";
    case "c#":
      return "csharp";
    default:
      return tag;
  }
};
