import {publicIpv4} from 'public-ip';

export const getPublicIpAddress = async (): Promise<string> => {
  try {
    const ipAddress = await publicIpv4(); // For IPv4
    // const ipAddress = await publicIp.v6(); // For IPv6
    return ipAddress;
  } catch (error) {
    throw new Error('Failed to retrieve public IP address');
  }
};
