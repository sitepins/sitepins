export type Role = "admin" | "user";

export type TSaveProfilePicture = {
  variables: FormData;
  fieldname: string;
  originalname: string;
  encoding: string;
  mimetype: string;
  size: number;
  bucket: string;
  key: string;
  acl: string;
  contentType: string | null;
  contentDisposition: string | null;
  contentEncoding: string | null;
  storageClass: string;
  serverSideEncryption: string | null;
  location: string;
  etag: string;
};

export type DeleteAccount = {
  variables: {
    user_id: string;
    reason?: string;
  };
};
