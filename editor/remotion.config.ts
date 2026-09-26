import { Config } from "@remotion/cli/config";

Config.setVideoImageFormat("jpeg");
Config.setOverwriteOutput(true);
// Necessário para o vídeo transparente da pessoa (WebM com canal alfa).
Config.setChromiumOpenGlRenderer("angle");
