/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as ai from "../ai.js";
import type * as aiActions from "../aiActions.js";
import type * as aiModels from "../aiModels.js";
import type * as aiProviderRuntime from "../aiProviderRuntime.js";
import type * as articles from "../articles.js";
import type * as auth from "../auth.js";
import type * as cms from "../cms.js";
import type * as http from "../http.js";
import type * as media from "../media.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  ai: typeof ai;
  aiActions: typeof aiActions;
  aiModels: typeof aiModels;
  aiProviderRuntime: typeof aiProviderRuntime;
  articles: typeof articles;
  auth: typeof auth;
  cms: typeof cms;
  http: typeof http;
  media: typeof media;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {};
