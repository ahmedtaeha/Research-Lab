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