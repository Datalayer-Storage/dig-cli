import { lookupService } from 'dns';

export const getPublicIpAddress = (): Promise<string> => {
  return new Promise((resolve, reject) => {
    lookupService('resolver1.opendns.com', 80, (err, hostname) => {
      if (err) {
        return reject(err);
      }
      const publicIp = hostname.split('.').slice(-4).join('.');
      resolve(publicIp);
    });
  });
}
