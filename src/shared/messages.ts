export const ADD_ALIAS = 'card-alias:add';
export const PING = 'card-alias:ping';

export interface AddAliasMessage {
  type: typeof ADD_ALIAS;
  selection: string;
}

export interface PingMessage {
  type: typeof PING;
}

export type Message = AddAliasMessage | PingMessage;
