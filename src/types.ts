export interface FileDetails {
  filename: string;
  sha256: string;
  relativePath: string;
}

export interface Config {
  deploy_dir: string;
  origin?: string;
}

export interface CreateStoreUserInputs {
  label?: string;
  description?: string;
  authorizedWriter?: string;
  oracleFee?: number;
}

export interface DigConfig {
    origin?: string;
    deploy_dir: string;
    [key: string]: any;
}

export interface RootHistoryItem {
  root_hash: string;
  timestamp: Number | undefined;
}

export interface DatFile {
  root: string;
  leaves: string[];
  files: {
    [key: string]: {
      hash: string;
      sha256: string;
    };
  };
}

export interface Credentials {
  username: string;
  password: string;
}

export interface ManageStoreArgs {
  action: string,
  actionArgs: GetProof
}

export interface GetProof {
  key: string,
  sha256: string,
}