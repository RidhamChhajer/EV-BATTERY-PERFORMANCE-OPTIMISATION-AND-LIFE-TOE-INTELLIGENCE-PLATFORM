"""Read CALCE v5 MATLAB objects with the pinned Python 3.10 reader stack."""
from io import BytesIO
import numpy as np
from scipy.io import loadmat
from scipy.io.matlab._mio5_params import MatlabOpaque
from matio.matio5 import read_subsystem, find_matlab_opaque
from matio.subsystem import get_matio_context, set_file_wrapper


def normalise_opaque_fields(array):
    if not isinstance(array, np.ndarray):
        return array
    # SciPy 1.15 uses legacy names; mat-io 0.4.2 expects the descriptive names.
    if isinstance(array, MatlabOpaque) and array.dtype.names == ('s0', 's1', 's2', 'arr'):
        names = ['_Name', '_TypeSystem', '_Class', '_ObjectMetadata']
        converted = np.empty(array.shape, dtype=list(zip(names, ['O'] * 4))).view(MatlabOpaque)
        for old, new in zip(array.dtype.names, names):
            converted[new] = array[old]
        for name in names[:3]:
            for index in np.ndindex(converted.shape):
                value = converted[index][name]
                if isinstance(value, bytes):
                    converted[index][name] = value.decode('utf-8')
        array = converted
    if array.dtype == object:
        for index in np.ndindex(array.shape):
            array[index] = normalise_opaque_fields(array[index])
    elif array.dtype.names:
        for index in np.ndindex(array.shape):
            for name in array.dtype.names:
                array[index][name] = normalise_opaque_fields(array[index][name])
    return array


def load_calce_mat(content):
    data = loadmat(BytesIO(content))
    workspace = data.pop('__function_workspace__', None)
    if workspace is None:
        raise ValueError('Expected CALCE MATLAB object metadata.')
    byte_order = '<' if workspace[0, 2] == ord('I') else '>'
    subsystem = normalise_opaque_fields(read_subsystem(workspace, byte_order, False, True))
    mcos = subsystem[0, 0]['MCOS']
    if mcos['_Class'].item() != 'FileWrapper__':
        raise ValueError('Unexpected MATLAB object metadata wrapper.')
    with get_matio_context():
        wrapper = set_file_wrapper()
        wrapper.init_load(mcos[0]['_ObjectMetadata'], byte_order, True, False)
        return {name: find_matlab_opaque(normalise_opaque_fields(value)) for name, value in data.items()}
