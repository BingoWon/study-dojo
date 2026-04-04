import type { NextConfig } from "next";

const config: NextConfig = {
  serverExternalPackages: ["@langchain/langgraph", "@langchain/core", "@langchain/openai"],
};

export default config;
