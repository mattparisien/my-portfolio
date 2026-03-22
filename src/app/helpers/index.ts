type Size = {
  width: number;
  height: number;
};

type FittedSize = Size & {
  scale: number;
};

/**
 * Scales an image to fit within a frame while maintaining aspect ratio.
 * The entire image will be visible (no cropping).
 */
export function fitImageToFrame(
  imageWidth: number,
  imageHeight: number,
  frameWidth: number,
  frameHeight: number
): FittedSize {
  if (
    imageWidth <= 0 ||
    imageHeight <= 0 ||
    frameWidth <= 0 ||
    frameHeight <= 0
  ) {
    throw new Error("All dimensions must be greater than 0.");
  }

  const widthScale = frameWidth / imageWidth;
  const heightScale = frameHeight / imageHeight;

  // Use the smaller scale to ensure the image fits entirely inside the frame
  const scale = Math.min(widthScale, heightScale);

  return {
    width: imageWidth * scale,
    height: imageHeight * scale,
    scale,
  };
}