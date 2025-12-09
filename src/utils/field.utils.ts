/**
 * Shared field utility functions for code generators
 */

import { AcceptType, ExposeType } from '../types/model.types.ts';

/**
 * Normalize expose config to a consistent object format
 * Handles string enum values: "default", "hidden", "create"
 */
export const normalizeExpose = (expose?: ExposeType): { create: boolean; read: boolean } => {
  if (expose === undefined || expose === 'default') {
    return { create: true, read: true };
  }
  if (expose === 'hidden') {
    return { create: false, read: false };
  }
  if (expose === 'create') {
    return { create: true, read: false };
  }
  // fallback (should never happen with proper validation)
  return { create: true, read: true };
};

/**
 * Normalize accept config to a consistent object format
 * Handles string enum values: "default", "create", "never"
 */
export const normalizeAccept = (accept?: AcceptType): { create: boolean; update: boolean } => {
  if (accept === 'create') {
    return { create: true, update: false };
  }
  if (accept === 'never') {
    return { create: false, update: false };
  }
  return { create: true, update: true };
};
