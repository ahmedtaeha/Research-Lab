#!/bin/bash
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
