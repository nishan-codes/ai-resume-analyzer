export interface PdfConversionResult {
  imageUrl: string;
  file: File | null;
  error?: string;
}

let pdfjsLib: any = null;
let isLoading = false;
let loadPromise: Promise<any> | null = null;

async function loadPdfJs(): Promise<any> {
  if (pdfjsLib) return pdfjsLib;
  if (loadPromise) return loadPromise;

  isLoading = true;
  console.log("Loading PDF.js library...");

  // @ts-expect-error - pdfjs-dist/build/pdf.mjs is not a module
  loadPromise = import("pdfjs-dist/build/pdf.mjs")
    .then((lib) => {
      console.log("PDF.js library imported successfully");
      // Set the worker source to use local file
      lib.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";
      console.log(
        "PDF.js worker source set to:",
        lib.GlobalWorkerOptions.workerSrc
      );
      pdfjsLib = lib;
      isLoading = false;
      return lib;
    })
    .catch((error) => {
      console.error("Failed to load PDF.js library:", error);
      isLoading = false;
      throw error;
    });

  return loadPromise;
}

export async function convertPdfToImage(
  file: File
): Promise<PdfConversionResult> {
  try {
    console.log(
      "Starting PDF conversion for file:",
      file.name,
      "Size:",
      file.size
    );

    // Check if file is a PDF
    if (
      !file.type.includes("pdf") &&
      !file.name.toLowerCase().endsWith(".pdf")
    ) {
      throw new Error("File is not a PDF");
    }

    // Check if file is not empty
    if (file.size === 0) {
      throw new Error("File is empty");
    }

    const lib = await loadPdfJs();
    console.log("PDF.js library loaded successfully");

    const arrayBuffer = await file.arrayBuffer();
    console.log("File converted to ArrayBuffer, size:", arrayBuffer.byteLength);

    const pdf = await lib.getDocument({ data: arrayBuffer }).promise;
    console.log("PDF document loaded, pages:", pdf.numPages);

    const page = await pdf.getPage(1);
    console.log("First page loaded successfully");

    const viewport = page.getViewport({ scale: 2 });
    const canvas = document.createElement("canvas");

    // Check if canvas is supported
    if (!canvas.getContext) {
      throw new Error("Canvas is not supported in this browser");
    }

    const context = canvas.getContext("2d");

    if (!context) {
      throw new Error("Failed to get 2D canvas context");
    }

    canvas.width = viewport.width;
    canvas.height = viewport.height;
    console.log(
      "Canvas created with dimensions:",
      canvas.width,
      "x",
      canvas.height
    );

    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = "high";

    await page.render({ canvasContext: context, viewport }).promise;
    console.log("Page rendered to canvas successfully");

    return new Promise((resolve) => {
      // Add timeout to prevent hanging
      const timeout = setTimeout(() => {
        console.error("Canvas toBlob timeout");
        resolve({
          imageUrl: "",
          file: null,
          error: "Canvas toBlob operation timed out",
        });
      }, 10000); // 10 second timeout

      canvas.toBlob(
        (blob) => {
          clearTimeout(timeout);
          if (blob) {
            console.log("Image blob created successfully, size:", blob.size);
            // Create a File from the blob with the same name as the pdf
            const originalName = file.name.replace(/\.pdf$/i, "");
            const imageFile = new File([blob], `${originalName}.png`, {
              type: "image/png",
            });

            resolve({
              imageUrl: URL.createObjectURL(blob),
              file: imageFile,
            });
          } else {
            console.error("Failed to create image blob");
            resolve({
              imageUrl: "",
              file: null,
              error: "Failed to create image blob",
            });
          }
        },
        "image/png",
        0.8 // Reduced quality to prevent issues
      );
    });
  } catch (err) {
    console.error("PDF conversion error:", err);
    return {
      imageUrl: "",
      file: null,
      error: `Failed to convert PDF: ${err}`,
    };
  }
}
