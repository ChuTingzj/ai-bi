import Docker from 'dockerode';

export type DockerPinger = {
  ping: () => Promise<unknown>;
};

/**
 * Docker daemon reachability only. Missing sandbox images are an `execute`
 * failure (`IMAGE_UNAVAILABLE`), not "Docker unavailable".
 */
export async function pingDockerDaemon(
  docker: DockerPinger = new Docker(),
): Promise<boolean> {
  try {
    await docker.ping();
    return true;
  } catch {
    return false;
  }
}
