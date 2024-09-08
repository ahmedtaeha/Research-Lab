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

// Create a script file
const scriptContent = `#!/bin/bash
cat << 'EOL' > /workspace/simple_segmentation.py
import numpy as np
import nibabel as nib
import os

def simple_segmentation(input_file, output_dir):
    # Load the NIfTI file
    img = nib.load(input_file)
    data = img.get_fdata()

    # Simple thresholding for demonstration
    liver = (data > 50) & (data < 200)
    kidney = (data > 200) & (data < 300)

    # Save segmentation results
    affine = img.affine
    nib.save(nib.Nifti1Image(liver.astype(np.int8), affine), os.path.join(output_dir, 'liver.nii.gz'))
    nib.save(nib.Nifti1Image(kidney.astype(np.int8), affine), os.path.join(output_dir, 'kidney.nii.gz'))

    print("Segmentation complete. Results saved in:", output_dir)

if __name__ == "__main__":
    input_file = '/workspace/inputs/case/ct.nii.gz'
    output_dir = '/workspace/outputs/case/segmentations'
    os.makedirs(output_dir, exist_ok=True)
    simple_segmentation(input_file, output_dir)
EOL

echo "Created simple_segmentation.py file."
cat /workspace/simple_segmentation.py
echo "Running simple_segmentation.py:"
python3 /workspace/simple_segmentation.py
echo "Contents of /workspace/outputs:"
ls -R /workspace/outputs
`;

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