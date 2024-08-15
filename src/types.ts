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
