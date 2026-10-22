// Vector math on macOS: Accelerate. Platform/Portable has plain loops for Linux and Windows.
#if canImport(Accelerate)
import Accelerate

extension Vectors {
    /// Converts `count` float16s into float32s.
    static func floats(fromHalf source: UnsafePointer<Float16>, count: Int, to destination: UnsafeMutablePointer<Float>) {
        var from = vImage_Buffer(data: UnsafeMutableRawPointer(mutating: source), height: 1,
                                 width: vImagePixelCount(count), rowBytes: count * 2)
        var to = vImage_Buffer(data: destination, height: 1, width: vImagePixelCount(count), rowBytes: count * 4)
        vImageConvert_Planar16FtoPlanarF(&from, &to, vImage_Flags(kvImageNoFlags))
    }

    /// `scores[i]` = the dot product of row `i` of `rows` (`count` rows of `dimension` floats) with `query`.
    static func scores(of rows: UnsafePointer<Float>, count: Int, query: UnsafePointer<Float>,
                       into scores: UnsafeMutablePointer<Float>) {
        vDSP_mmul(rows, 1, query, 1, scores, 1, vDSP_Length(count), 1, vDSP_Length(dimension))
    }

    /// `sums[j]` += Σᵢ `weights[i]` × row `i`'s `j`th float: the rows, weighted and added up (the code map's PCA).
    static func addWeighted(_ rows: UnsafePointer<Float>, count: Int, weights: UnsafePointer<Float>,
                            into sums: UnsafeMutablePointer<Float>) {
        var block = [Float](repeating: 0, count: dimension)
        vDSP_mmul(weights, 1, rows, 1, &block, 1, 1, vDSP_Length(dimension), vDSP_Length(count))
        vDSP_vadd(sums, 1, block, 1, sums, 1, vDSP_Length(dimension))
    }
}
#endif
