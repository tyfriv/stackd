/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";
import type * as comments from "../comments.js";
import type * as internal_notificationTriggers from "../internal/notificationTriggers.js";
import type * as lib_apiHelpers from "../lib/apiHelpers.js";
import type * as logs_logOperations from "../logs/logOperations.js";
import type * as media_mediaQueries from "../media/mediaQueries.js";
import type * as media_rawg from "../media/rawg.js";
import type * as media_spotify from "../media/spotify.js";
import type * as media_tmdb from "../media/tmdb.js";
import type * as reactions from "../reactions.js";
import type * as socials_blocks from "../socials/blocks.js";
import type * as socials_follows from "../socials/follows.js";
import type * as socials_utils from "../socials/utils.js";
import type * as users from "../users.js";

/**
 * A utility for referencing Convex functions in your app's API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
declare const fullApi: ApiFromModules<{
  comments: typeof comments;
  "internal/notificationTriggers": typeof internal_notificationTriggers;
  "lib/apiHelpers": typeof lib_apiHelpers;
  "logs/logOperations": typeof logs_logOperations;
  "media/mediaQueries": typeof media_mediaQueries;
  "media/rawg": typeof media_rawg;
  "media/spotify": typeof media_spotify;
  "media/tmdb": typeof media_tmdb;
  reactions: typeof reactions;
  "socials/blocks": typeof socials_blocks;
  "socials/follows": typeof socials_follows;
  "socials/utils": typeof socials_utils;
  users: typeof users;
}>;
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;
