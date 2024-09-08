const express = require('express');
const multer = require('multer');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const { exec } = require('child_process');
const app = express();
const port = 3000;

app.use(cors());

// Set up file upload handling
const upload = multer({ dest: 'uploads/' });

// Serve static files from the current directory
app.use(express.static(__dirname));

// ... (keep the existing code up to the scriptContent definition)

const scriptContent = `#!/bin/bash
cat << 'EOL' > /workspace/improved_segmentation.py
import numpy as np
import nibabel as nib
import os
from scipy import ndimage

def improved_segmentation(input_file, output_dir):
    # Load the NIfTI file
    img = nib.load(input_file)
    data = img.get_fdata()

    # Normalize data
    data_normalized = (data - data.min()) / (data.max() - data.min())

    # Define segmentation functions
    def segment_organ(data, min_val, max_val, erosion_iterations=1, dilation_iterations=2):
        mask = (data > min_val) & (data < max_val)
        mask = ndimage.binary_erosion(mask, iterations=erosion_iterations)
        mask = ndimage.binary_dilation(mask, iterations=dilation_iterations)
        return mask

    # Segment different structures
    structures = {
        'liver': segment_organ(data_normalized, 0.4, 0.7),
        'kidney_left': segment_organ(data_normalized, 0.6, 0.8),
        'kidney_right': segment_organ(data_normalized, 0.6, 0.8),
        'spleen': segment_organ(data_normalized, 0.5, 0.7),
        'lungs': segment_organ(data_normalized, 0.05, 0.2, erosion_iterations=2, dilation_iterations=3),
        'heart': segment_organ(data_normalized, 0.3, 0.5),
        'brain': segment_organ(data_normalized, 0.2, 0.4, erosion_iterations=2, dilation_iterations=3),
    }

    # Save segmentation results
    affine = img.affine
    for organ, mask in structures.items():
        nib.save(nib.Nifti1Image(mask.astype(np.int8), affine), os.path.join(output_dir, f'{organ}.nii.gz'))

    print("Segmentation complete. Results saved in:", output_dir)

if __name__ == "__main__":
    input_file = '/workspace/inputs/case/ct.nii.gz'
    output_dir = '/workspace/outputs/case/segmentations'
    os.makedirs(output_dir, exist_ok=True)
    improved_segmentation(input_file, output_dir)
EOL

echo "Created improved_segmentation.py file."
cat /workspace/improved_segmentation.py
echo "Running improved_segmentation.py:"
python3 /workspace/improved_segmentation.py
echo "Contents of /workspace/outputs:"
ls -R /workspace/outputs
`;

// ... (keep the rest of the server.js code the same)

fs.writeFileSync('run_inference.sh', scriptContent);

// Handle file upload
app.post('/segment', upload.single('file'), (req, res) => {
    if (!req.file) {
        return res.status(400).send('No file uploaded.');
    }

    console.log('File received:', req.file.originalname);

    const inputDir = path.join(__dirname, 'inputs');
    const outputDir = path.join(__dirname, 'outputs');
    const caseName = 'case';

    console.log('Input directory:', inputDir);
    console.log('Output directory:', outputDir);

    // Ensure directories exist
    fs.mkdirSync(path.join(inputDir, caseName), { recursive: true });
    fs.mkdirSync(outputDir, { recursive: true });

    // Move uploaded file to input directory
    fs.renameSync(req.file.path, path.join(inputDir, caseName, 'ct.nii.gz'));

    console.log('File moved to:', path.join(inputDir, caseName, 'ct.nii.gz'));

    // Docker command
    const dockerCommand = `docker run --platform linux/amd64 --rm -v "${inputDir}":/workspace/inputs -v "${outputDir}":/workspace/outputs -v "${path.join(__dirname, 'run_inference.sh')}":/tmp/run_inference.sh qchen99/suprem:v1 /bin/bash -c "mkdir -p /workspace/outputs /workspace/inputs/${caseName} && chmod -R 777 /workspace/outputs /workspace/inputs && chmod +x /tmp/run_inference.sh && /tmp/run_inference.sh"`;

    console.log('Running Docker command:', dockerCommand);

    // Execute Docker command
    exec(dockerCommand, (error, stdout, stderr) => {
        console.log('Docker stdout:', stdout);
        console.error('Docker stderr:', stderr);

        if (error) {
            console.error(`exec error: ${error}`);
            return res.status(500).json({ error: 'Error running segmentation', logs: stdout + stderr });
        }

        // Read output directory
        fs.readdir(path.join(outputDir, caseName, 'segmentations'), (err, files) => {
            if (err) {
                console.error(`Error reading output directory: ${err}`);
                return res.status(500).json({ error: 'Error reading segmentation results', logs: stdout + stderr });
            }

            console.log('Output files:', files);
            res.json({ segments: files, logs: stdout + stderr });

            // Clean up
            fs.rmSync(path.join(inputDir, caseName), { recursive: true, force: true });
            fs.rmSync(path.join(outputDir, caseName), { recursive: true, force: true });
        });
    });
});

app.listen(port, () => {
    console.log(`Server running at http://localhost:${port}`);
});