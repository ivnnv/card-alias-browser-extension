export const ADD_ALIAS = 'card-alias:add';

export interface AddAliasMessage {
  type: typeof ADD_ALIAS;
  selection: string;
}

export type Message = AddAliasMessage;
